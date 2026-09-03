import { afterEach, describe, expect, it } from "vitest";
import { createMediaMock, devices } from "../lib/main";

/**
 * WebKit on Linux parks a mocked stream at HAVE_FUTURE_DATA forever. Every
 * other engine reaches HAVE_ENOUGH_DATA on its own, so the interesting logic
 * never runs there — these tests park the native getter at 3 to reproduce the
 * condition the reporter exists for.
 */
const HAVE_FUTURE_DATA = 3;
const HAVE_ENOUGH_DATA = 4;

const nativeDescriptor = Object.getOwnPropertyDescriptor(
  HTMLMediaElement.prototype,
  "readyState",
) as PropertyDescriptor;

/** Makes the browser behave like WebKit on Linux. Returns the undo. */
function parkNativeReadyState(): VoidFunction {
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
    configurable: true,
    enumerable: nativeDescriptor.enumerable,
    get: () => HAVE_FUTURE_DATA,
  });
  return () => {
    Object.defineProperty(
      HTMLMediaElement.prototype,
      "readyState",
      nativeDescriptor,
    );
  };
}

/** A video whose decoded frame count this test drives by hand. */
function videoWithFrameCounter(stream: MediaStream) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  document.body.append(video);
  video.srcObject = stream;

  const counter = { frames: 0 };
  Object.defineProperty(video, "getVideoPlaybackQuality", {
    configurable: true,
    value: () => ({ totalVideoFrames: counter.frames }),
  });
  return { video, counter };
}

describe("readyState reported from arriving frames", () => {
  const mock = createMediaMock();
  const cleanups: VoidFunction[] = [];

  afterEach(() => {
    mock.unmock();
    for (const undo of cleanups.splice(0).reverse()) {
      undo();
    }
    for (const video of document.querySelectorAll("video")) {
      video.remove();
    }
  });

  /** Parks the native getter, then mocks so the reporter wraps the parked one. */
  async function parkedStream() {
    cleanups.push(parkNativeReadyState());
    mock.mock(devices["iPhone 12"], { emulateVideoFrameCallback: true });
    return navigator.mediaDevices.getUserMedia({ video: true });
  }

  it("should not claim readiness before a frame has arrived", async () => {
    const { video } = videoWithFrameCounter(await parkedStream());

    expect(video.readyState).toBe(HAVE_FUTURE_DATA);
  });

  it("should report readiness once a frame arrives", async () => {
    const { video, counter } = videoWithFrameCounter(await parkedStream());
    video.readyState; // establishes the baseline, as a first poll would

    counter.frames = 1;

    expect(video.readyState).toBe(HAVE_ENOUGH_DATA);
  });

  it("should hold readiness steady between frames", async () => {
    // A consumer polling faster than the frame rate must not see it flicker.
    const { video, counter } = videoWithFrameCounter(await parkedStream());
    video.readyState;
    counter.frames = 1;
    expect(video.readyState).toBe(HAVE_ENOUGH_DATA);

    expect(video.readyState).toBe(HAVE_ENOUGH_DATA);
    expect(video.readyState).toBe(HAVE_ENOUGH_DATA);
  });

  it("should withdraw readiness once frames stop", async () => {
    // The whole point: a stalled stream has to keep looking stalled.
    const { video, counter } = videoWithFrameCounter(await parkedStream());
    video.readyState;
    counter.frames = 1;
    expect(video.readyState).toBe(HAVE_ENOUGH_DATA);

    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(video.readyState).toBe(HAVE_FUTURE_DATA);
  });

  it("should recover when frames start arriving again", async () => {
    const { video, counter } = videoWithFrameCounter(await parkedStream());
    video.readyState;
    counter.frames = 1;
    video.readyState;
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(video.readyState).toBe(HAVE_FUTURE_DATA);

    counter.frames = 2;

    expect(video.readyState).toBe(HAVE_ENOUGH_DATA);
  });

  it("should not speak for a stream the mock did not create", async () => {
    await parkedStream();
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    canvas.getContext("2d")?.fillRect(0, 0, 32, 32);
    const { video, counter } = videoWithFrameCounter(canvas.captureStream(30));
    video.readyState;
    counter.frames = 5;

    expect(video.readyState).toBe(HAVE_FUTURE_DATA);
  });

  it("should pass through a readyState below HAVE_FUTURE_DATA", async () => {
    // Never contradict the browser when it says it lacks the frames.
    mock.mock(devices["iPhone 12"], { emulateVideoFrameCallback: true });
    const video = document.createElement("video");
    document.body.append(video);

    expect(video.readyState).toBe(0);
  });
});
