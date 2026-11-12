import { afterEach, describe, expect, it, vi } from "vitest";
import { FRAME_STATS_ID } from "../lib/debugView";
import {
  createMediaMock,
  devices,
  FrameOutput,
  type FrameSource,
} from "../lib/main";

/** BT.601 limited-range luma of the two colours the tests paint. */
const RED_LUMA = 82;
const BLUE_LUMA = 41;

/** Chrome and Edge: the only engines that get NV12 output. */
const hasTrackGenerator = "MediaStreamTrackGenerator" in globalThis;

/** A source painting one solid colour, which a test may change between frames. */
function solid(colour: string): FrameSource & { colour: string } {
  return {
    colour,
    size: { width: 0, height: 0 },
    drawInto(ctx, width, height) {
      ctx.fillStyle = this.colour;
      ctx.fillRect(0, 0, width, height);
    },
  };
}

const videos: HTMLVideoElement[] = [];

async function play(stream: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  document.body.append(video);
  videos.push(video);
  video.srcObject = stream;
  await video.play();
  return video;
}

function nextFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("no frame within 3s")),
      3000,
    );
    video.requestVideoFrameCallback(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** The frame the video is presenting, as a WebCodecs consumer would read it. */
async function presentedFrame(video: HTMLVideoElement) {
  await nextFrame(video);
  const frame = new VideoFrame(video);
  try {
    const { format, displayWidth, displayHeight } = frame;
    let centreLuma = Number.NaN;
    if (format === "NV12") {
      // Tightly packed by default: the Y plane comes first, one byte per pixel.
      const data = new Uint8Array(frame.allocationSize());
      await frame.copyTo(data);
      centreLuma = data[(displayHeight / 2) * displayWidth + displayWidth / 2];
    }
    return { format, displayWidth, displayHeight, centreLuma };
  } finally {
    frame.close();
  }
}

const centreLuma = (video: HTMLVideoElement) => async () =>
  (await presentedFrame(video)).centreLuma;

const near = (expected: number) => (actual: number) =>
  Math.abs(actual - expected) <= 2;

/** Whether a track is plain canvas capture rather than generated frames. */
const isCanvasCapture = (track: MediaStreamTrack) =>
  (track as CanvasCaptureMediaStreamTrack).canvas instanceof HTMLCanvasElement;

describe("FrameOutput.VideoFrameNV12", () => {
  const mock = createMediaMock();

  afterEach(() => {
    mock.unmock();
    mock.configure({ frameOutput: FrameOutput.Canvas, canvasScaleFactor: 1 });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const video of videos.splice(0)) {
      video.remove();
    }
  });

  async function nv12Stream(
    source: string | HTMLCanvasElement | FrameSource,
    constraints: MediaStreamConstraints = {
      video: { width: 640, height: 480 },
    },
  ): Promise<MediaStream> {
    mock
      .configure({ frameOutput: FrameOutput.VideoFrameNV12 })
      .mock(devices["Mac Desktop"]);
    await mock.setSource(source);
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  describe.runIf(hasTrackGenerator)("with a track generator", () => {
    it("should deliver NV12 frames at the track's size, as a real camera does", async () => {
      const stream = await nv12Stream(solid("#ff0000"));
      const { width, height } = stream.getVideoTracks()[0].getSettings();
      const frame = await presentedFrame(await play(stream));

      expect(frame.format).toBe("NV12");
      expect(frame.displayWidth).toBe(width);
      expect(frame.displayHeight).toBe(height);
    });

    it("should carry the source's pixels", async () => {
      const video = await play(await nv12Stream(solid("#ff0000")));

      await expect.poll(centreLuma(video)).toSatisfy(near(RED_LUMA));
    });

    it("should keep up with a source that changes between frames", async () => {
      const source = solid("#ff0000");
      const video = await play(await nv12Stream(source));
      await expect.poll(centreLuma(video)).toSatisfy(near(RED_LUMA));

      source.colour = "#0000ff";

      await expect.poll(centreLuma(video)).toSatisfy(near(BLUE_LUMA));
    });

    it("should follow a source swap on a live stream", async () => {
      const video = await play(await nv12Stream(solid("#ff0000")));

      await mock.setSource(solid("#0000ff"));

      await expect.poll(centreLuma(video)).toSatisfy(near(BLUE_LUMA));
    });

    it("should convert a still image once, not on every frame", async () => {
      const readback = vi.spyOn(
        CanvasRenderingContext2D.prototype,
        "getImageData",
      );
      const video = await play(await nv12Stream("/assets/ean8_12345670.png"));
      for (let i = 0; i < 5; i++) {
        await nextFrame(video);
      }

      expect(readback).toHaveBeenCalledTimes(1);

      // A new scale factor changes the picture, so it is converted again.
      mock.configure({ canvasScaleFactor: 0.5 });
      await expect.poll(() => readback.mock.calls.length).toBe(2);
    });

    it("should stop converting once the consumer stops the track", async () => {
      const readback = vi.spyOn(
        CanvasRenderingContext2D.prototype,
        "getImageData",
      );
      const [track] = (await nv12Stream(solid("#ff0000"))).getVideoTracks();
      await expect.poll(() => readback.mock.calls.length).toBeGreaterThan(1);

      track.stop();
      const convertedBeforeStop = readback.mock.calls.length;
      // About six ticks at 30 fps: nothing signals that a tick was skipped.
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(readback).toHaveBeenCalledTimes(convertedBeforeStop);
    });

    it("should report the emulated camera and the requested frame rate", async () => {
      const stream = await nv12Stream(solid("#ff0000"), {
        video: { width: 640, height: 480, frameRate: 15 },
      });
      const [track] = stream.getVideoTracks();
      const camera = devices["Mac Desktop"].mediaDeviceInfo.find(
        (device) => device.kind === "videoinput",
      );

      expect(track.label).toBe(camera?.label);
      expect(track.getSettings()).toMatchObject({
        deviceId: camera?.deviceId,
        frameRate: 15,
      });
    });

    it("should stream again after a second getUserMedia", async () => {
      await nv12Stream(solid("#ff0000"));
      const second = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      expect((await presentedFrame(await play(second))).format).toBe("NV12");
    });

    it("should show the delivered frame format and rate in debug mode", async () => {
      mock.enableDebugMode();
      await play(await nv12Stream(solid("#ff0000")));
      const stats = () => document.getElementById(FRAME_STATS_ID)?.textContent;

      await expect.poll(stats, { timeout: 3000 }).toMatch(/NV12 · \d+ fps/);
      // It sits over the consumer's page, so it must never take their clicks.
      const overlay = document.getElementById(FRAME_STATS_ID) as HTMLElement;
      expect(getComputedStyle(overlay).pointerEvents).toBe("none");

      mock.disableDebugMode();
      expect(stats()).toBeUndefined();
    });
  });

  it("should keep capturing a canvas the consumer renders", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;

    const [track] = (await nv12Stream(canvas)).getVideoTracks();

    expect((track as CanvasCaptureMediaStreamTrack).canvas).toBe(canvas);
  });

  it("should fall back to canvas capture where no track generator exists", async () => {
    // Safari and Firefox, or Chrome with the generator taken away.
    vi.stubGlobal("MediaStreamTrackGenerator", undefined);

    const [track] = (await nv12Stream(solid("#ff0000"))).getVideoTracks();

    expect(isCanvasCapture(track)).toBe(true);
  });

  it("should fall back to canvas capture for an odd frame size", async () => {
    // NV12 has one chroma sample per 2x2 block.
    mock.configure({ frameOutput: FrameOutput.VideoFrameNV12 }).mock({
      ...devices["Mac Desktop"],
      videoResolutions: [{ width: 641, height: 481 }],
    });
    await mock.setSource(solid("#ff0000"));

    const [track] = (
      await navigator.mediaDevices.getUserMedia({ video: true })
    ).getVideoTracks();

    expect(isCanvasCapture(track)).toBe(true);
  });
});
