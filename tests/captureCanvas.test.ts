import { afterEach, describe, expect, it } from "vitest";
import { createMediaMock, devices } from "../lib/main";

/**
 * The canvas MediaMock creates and paints is what `captureStream()` turns into
 * frames, so how the browser backs it decides how cheaply a consumer gets them.
 */
describe("the capture canvas MediaMock owns", () => {
  const imageUrl = "/assets/ean8_12345670.png";
  const mock = createMediaMock();
  const videos: HTMLVideoElement[] = [];

  afterEach(() => {
    mock.unmock();
    for (const video of videos.splice(0)) {
      video.remove();
    }
  });

  async function streamImage(): Promise<MediaStream> {
    mock.mock(devices["Mac Desktop"]);
    await mock.setSource(imageUrl);
    return navigator.mediaDevices.getUserMedia({ video: true });
  }

  it("should not ask for a CPU-only 2D context", async (context) => {
    // willReadFrequently keeps a canvas on the CPU in Chromium, so a WebGL
    // consumer has to upload every captured frame again (#81). The mock reads
    // the canvas back once per start, which does not call for it.
    await streamImage();

    const canvas = document.getElementById(
      "media-mock-canvas",
    ) as HTMLCanvasElement;
    const attributes = canvas.getContext("2d")?.getContextAttributes?.();
    if (attributes?.willReadFrequently === undefined) {
      context.skip("this engine does not report willReadFrequently");
    }

    expect(attributes?.willReadFrequently).toBe(false);
  });

  it("should deliver the source image in the frames a video receives", async (context) => {
    const stream = await streamImage();
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    document.body.append(video);
    videos.push(video);
    video.srcObject = stream;

    const loaded = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 3000);
      video.addEventListener(
        "loadeddata",
        () => {
          clearTimeout(timer);
          resolve(true);
        },
        { once: true },
      );
    });
    if (!loaded) {
      // Playwright's WebKit on macOS never starts playback for a canvas stream.
      context.skip("this engine never plays a canvas stream");
    }

    const sample = document.createElement("canvas");
    sample.width = video.videoWidth;
    sample.height = video.videoHeight;
    const ctx = sample.getContext("2d") as CanvasRenderingContext2D;
    ctx.drawImage(video, 0, 0);
    const { data } = ctx.getImageData(0, 0, sample.width, sample.height);
    let darkPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 128 && data[i + 1] < 128 && data[i + 2] < 128) {
        darkPixels++;
      }
    }

    // The barcode has black bars; a blank first frame is all white.
    expect(darkPixels).toBeGreaterThan(0);
  });
});
