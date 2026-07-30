import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { devices, MediaMock } from "../lib/main";

describe("getUserMedia racing an in-flight setSource", () => {
  const imageUrl = "/assets/ean8_12345670.png";
  const created: HTMLCanvasElement[] = [];

  const makeConsumerCanvas = (width = 800, height = 600) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(0, 0, width, height);
    }
    document.body.append(canvas);
    created.push(canvas);
    return canvas;
  };

  beforeEach(() => {
    MediaMock.unmock();
  });

  afterEach(() => {
    for (const c of created.splice(0)) c.remove();
  });

  afterAll(() => {
    MediaMock.unmock();
  });

  it("should capture the consumer canvas even when setSource was not awaited", async () => {
    const canvas = makeConsumerCanvas(800, 600);
    MediaMock.mock(devices["Mac Desktop"]);

    // Deliberately not awaited — the mistake this guards against.
    const pending = MediaMock.setSource(canvas);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    await pending;

    // A borrowed canvas means MediaMock created none of its own.
    expect(document.getElementById("media-mock-canvas")).toBeNull();
    expect(stream.getVideoTracks()[0].getSettings().width).toBe(800);
  });

  it("should stream the requested image even when setSource was not awaited", async () => {
    MediaMock.mock(devices["Mac Desktop"]);

    const pending = MediaMock.setSource(imageUrl);
    await navigator.mediaDevices.getUserMedia({ video: true });

    // Sample the frame that capture actually started on, before the in-flight
    // setSource has a chance to repaint it.
    const canvas = document.getElementById(
      "media-mock-canvas",
    ) as HTMLCanvasElement;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let darkPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 128 && data[i + 1] < 128 && data[i + 2] < 128) {
        darkPixels++;
      }
    }

    await pending;

    // The barcode has black bars; the 1x1 placeholder yields a blank white
    // canvas, so zero dark pixels means the placeholder was substituted.
    expect(darkPixels).toBeGreaterThan(0);
    expect(MediaMock.settings.mediaURL).toBe(imageUrl);
  });
});
