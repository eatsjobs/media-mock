import { afterEach, describe, expect, it } from "vitest";
import { createMediaMock, devices } from "../lib/main";

/**
 * WebKit on Linux under a virtual monitor never invokes
 * `requestVideoFrameCallback`, however healthy the stream is. The mock can
 * deliver it instead — but only on evidence that a frame arrived.
 */
const nativeRequest = HTMLVideoElement.prototype.requestVideoFrameCallback;
const nativeCancel = HTMLVideoElement.prototype.cancelVideoFrameCallback;
const nativeReadyState = Object.getOwnPropertyDescriptor(
  HTMLMediaElement.prototype,
  "readyState",
)?.get as () => number;

/**
 * Drives the video's decoded frame count by hand.
 *
 * Playwright's WebKit on macOS never starts playback for a canvas stream — the
 * element stays paused and decodes nothing — so a test that waits for real
 * frames there passes only vacuously. The driver reads the frame count and
 * nothing else, so supplying it directly tests the same logic in every engine.
 */
function withFrameCounter(video: HTMLVideoElement) {
  const counter = { frames: 0 };
  Object.defineProperty(video, "getVideoPlaybackQuality", {
    configurable: true,
    value: () => ({ totalVideoFrames: counter.frames }),
  });
  return counter;
}

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

  it("should deliver a frame once one arrives", async () => {
    mock.mock(devices["iPhone 12"], { emulateVideoFrameCallback: true });
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = attach(stream);
    videos.push(video);
    const counter = withFrameCounter(video);

    const pending = nextFrame(video);
    counter.frames = 1;
    const metadata = await pending;

    expect(metadata).not.toBeNull();
    expect(metadata?.presentedFrames).toBe(1);
    expect(metadata?.width).toBe(video.videoWidth);
    expect(metadata?.height).toBe(video.videoHeight);
  });

  it("should keep delivering while frames keep arriving", async () => {
    mock.mock(devices["iPhone 12"], { emulateVideoFrameCallback: true });
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = attach(stream);
    videos.push(video);
    const counter = withFrameCounter(video);

    let count = 0;
    const pump = () => {
      video.requestVideoFrameCallback(() => {
        count++;
        pump();
      });
    };
    pump();
    const ticking = setInterval(() => {
      counter.frames++;
    }, 20);
    await new Promise((resolve) => setTimeout(resolve, 500));
    clearInterval(ticking);

    expect(count).toBeGreaterThan(1);
  });

  it("should go quiet once frames stop arriving", async () => {
    // The whole point: it reports frames, it does not invent them.
    mock.mock(devices["iPhone 12"], { emulateVideoFrameCallback: true });
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = attach(stream);
    videos.push(video);
    const counter = withFrameCounter(video);

    const pending = nextFrame(video);
    counter.frames = 1;
    expect(await pending).not.toBeNull();

    expect(await nextFrame(video, 400)).toBeNull();
  });

  it("should leave the native readyState alone by default", () => {
    mock.mock(devices["iPhone 12"]);

    expect(
      Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "readyState")
        ?.get,
    ).toBe(nativeReadyState);
  });

  it("should restore the native readyState on unmock", () => {
    mock.mock(devices["iPhone 12"], { emulateVideoFrameCallback: true });

    mock.unmock();

    expect(
      Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "readyState")
        ?.get,
    ).toBe(nativeReadyState);
  });

  it("should not claim readiness for a video with no stream", () => {
    mock.mock(devices["iPhone 12"], { emulateVideoFrameCallback: true });
    const video = document.createElement("video");
    videos.push(video);

    expect(video.readyState).toBe(0);
  });

  it("should report the browser's own readyState for someone else's stream", async () => {
    mock.mock(devices["iPhone 12"], { emulateVideoFrameCallback: true });
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    canvas.getContext("2d")?.fillRect(0, 0, 64, 64);
    const video = attach(canvas.captureStream(30));
    videos.push(video);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(video.readyState).toBe(nativeReadyState.call(video));
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
