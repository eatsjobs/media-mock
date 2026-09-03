import { afterEach, describe, expect, it } from "vitest";
import { createMediaMock, devices } from "../lib/main";

/**
 * WebKit on Linux under a virtual monitor never invokes
 * `requestVideoFrameCallback`, however healthy the stream is. The mock can
 * deliver it instead — but only on evidence that a frame arrived.
 */
const nativeRequest = HTMLVideoElement.prototype.requestVideoFrameCallback;
const nativeCancel = HTMLVideoElement.prototype.cancelVideoFrameCallback;

function attach(stream: MediaStream): HTMLVideoElement {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  document.body.append(video);
  video.srcObject = stream;
  return video;
}

/** Resolves with the first callback's metadata, or null if none arrives. */
function nextFrame(
  video: HTMLVideoElement,
  timeoutMs = 3000,
): Promise<VideoFrameCallbackMetadata | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    video.requestVideoFrameCallback((_now, metadata) => {
      clearTimeout(timer);
      resolve(metadata);
    });
  });
}

describe("emulated requestVideoFrameCallback", () => {
  const mock = createMediaMock();
  const videos: HTMLVideoElement[] = [];

  afterEach(() => {
    mock.unmock();
    for (const video of videos.splice(0)) {
      video.remove();
    }
  });

  it("should leave the native callback alone by default", () => {
    mock.mock(devices["iPhone 12"]);

    expect(HTMLVideoElement.prototype.requestVideoFrameCallback).toBe(
      nativeRequest,
    );
  });

  it("should restore the native callback on unmock", () => {
    mock.mock(devices["iPhone 12"], { emulateVideoFrameCallback: true });

    mock.unmock();

    expect(HTMLVideoElement.prototype.requestVideoFrameCallback).toBe(
      nativeRequest,
    );
    expect(HTMLVideoElement.prototype.cancelVideoFrameCallback).toBe(
      nativeCancel,
    );
  });

  it("should deliver a frame for a video playing a mocked stream", async () => {
    mock.mock(devices["iPhone 12"], { emulateVideoFrameCallback: true });
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = attach(stream);
    videos.push(video);
    await video.play().catch(() => undefined);

    const metadata = await nextFrame(video);

    expect(metadata).not.toBeNull();
    expect(metadata?.presentedFrames).toBeGreaterThan(0);
    expect(metadata?.width).toBe(video.videoWidth);
    expect(metadata?.height).toBe(video.videoHeight);
  });

  it("should keep delivering while frames keep arriving", async () => {
    mock.mock(devices["iPhone 12"], { emulateVideoFrameCallback: true });
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = attach(stream);
    videos.push(video);
    await video.play().catch(() => undefined);

    let count = 0;
    const pump = () => {
      video.requestVideoFrameCallback(() => {
        count++;
        pump();
      });
    };
    pump();
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(count).toBeGreaterThan(1);
  });

  it("should go quiet once the stream stops producing frames", async () => {
    // The whole point: it reports frames, it does not invent them.
    mock.mock(devices["iPhone 12"], { emulateVideoFrameCallback: true });
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = attach(stream);
    videos.push(video);
    await video.play().catch(() => undefined);
    await nextFrame(video);

    for (const track of stream.getVideoTracks()) {
      track.stop();
    }
    // The browser still hands over the frame that was already in flight, and
    // reporting it is correct — the driver only claims frames that arrived.
    await nextFrame(video, 600);

    expect(await nextFrame(video, 600)).toBeNull();
  });

  it("should leave a video playing someone else's stream to the browser", async () => {
    mock.mock(devices["iPhone 12"], { emulateVideoFrameCallback: true });
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    canvas.getContext("2d")?.fillRect(0, 0, 64, 64);
    const video = attach(canvas.captureStream(30));
    videos.push(video);

    // No play(): WebKit never settles it for a canvas stream it did not make,
    // and registering the callback is all this needs.
    // Handles below the driver's origin can only have come from the browser.
    const handle = video.requestVideoFrameCallback(() => undefined);

    expect(handle).toBeLessThan(1_000_000);
    video.cancelVideoFrameCallback(handle);
  });
});
