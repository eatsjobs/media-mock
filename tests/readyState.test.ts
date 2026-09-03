import { afterEach, describe, expect, it } from "vitest";
import { createMediaMock, devices } from "../lib/main";

/**
 * WebKit on Linux parks a `<video>` fed a MediaStream at HAVE_FUTURE_DATA (3)
 * forever, even while frames arrive at the requested rate and currentTime
 * advances. Consumers that wait for `readyState === 4` never start.
 *
 * The mock can report the readiness the frames actually justify — but only for
 * streams it produced, and only where the browser has already parked at 3.
 */
const nativeReadyState = Object.getOwnPropertyDescriptor(
  HTMLMediaElement.prototype,
  "readyState",
)?.get as () => number;

const HAVE_NOTHING = 0;
const HAVE_ENOUGH_DATA = 4;

async function playing(video: HTMLVideoElement): Promise<void> {
  await video.play().catch(() => undefined);
  if (video.readyState >= 3) {
    return;
  }
  await new Promise<void>((resolve) => {
    video.addEventListener("playing", () => resolve(), { once: true });
    setTimeout(resolve, 2000);
  });
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

describe("readyState of a video playing a mocked stream", () => {
  const mock = createMediaMock();
  const videos: HTMLVideoElement[] = [];

  afterEach(() => {
    mock.unmock();
    for (const video of videos.splice(0)) {
      video.remove();
    }
  });

  it("should leave the native readyState alone by default", () => {
    mock.mock(devices["iPhone 12"]);

    expect(
      Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "readyState")
        ?.get,
    ).toBe(nativeReadyState);
  });

  it("should report a complete readyState for a mocked stream", async () => {
    mock.mock(devices["iPhone 12"], { forceReadyState: true });
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = attach(stream);
    videos.push(video);

    await playing(video);

    expect(video.readyState).toBe(HAVE_ENOUGH_DATA);
  });

  it("should not claim readiness for a video with no stream", () => {
    mock.mock(devices["iPhone 12"], { forceReadyState: true });
    const video = document.createElement("video");
    videos.push(video);

    expect(video.readyState).toBe(HAVE_NOTHING);
  });

  it("should not speak for a stream the mock did not create", async () => {
    mock.mock(devices["iPhone 12"], { forceReadyState: true });
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    canvas.getContext("2d")?.fillRect(0, 0, 64, 64);
    const video = attach(canvas.captureStream(30));
    videos.push(video);

    // No play() here: WebKit never settles it for a canvas stream it did not
    // make, and the point is only that the reported value is the native one.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(video.readyState).toBe(nativeReadyState.call(video));
  });

  it("should restore the native readyState on unmock", () => {
    mock.mock(devices["iPhone 12"], { forceReadyState: true });

    mock.unmock();

    expect(
      Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "readyState")
        ?.get,
    ).toBe(nativeReadyState);
  });
});
