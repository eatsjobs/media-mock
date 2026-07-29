import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { devices, MediaMock } from "../lib/main";

describe("consumer-supplied canvas as the stream source", () => {
  const imageUrl = "/assets/ean8_12345670.png";
  const created: HTMLCanvasElement[] = [];

  /** A canvas the consumer owns and renders into, as a 3D library would. */
  const makeConsumerCanvas = (width = 800, height = 600) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.id = "consumer-canvas";
    document.body.append(canvas);
    created.push(canvas);
    return canvas;
  };

  beforeEach(() => {
    MediaMock.unmock();
  });

  afterEach(() => {
    for (const canvas of created.splice(0)) {
      canvas.remove();
    }
  });

  afterAll(() => {
    MediaMock.unmock();
  });

  it("should stream a canvas the consumer renders into", async () => {
    const canvas = makeConsumerCanvas();
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#00ff00";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    MediaMock.mock(devices["Mac Desktop"]);
    await MediaMock.setSource(canvas);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });

    expect(stream.getVideoTracks()).toHaveLength(1);
    expect(stream.getVideoTracks()[0].readyState).toBe("live");
  });

  it("should never acquire a context on the consumer's canvas", async () => {
    // A WebGL canvas returns null from getContext("2d"), which used to throw
    // "Failed to get 2D canvas context". MediaMock must not ask at all.
    const canvas = makeConsumerCanvas();
    const spy = vi.spyOn(canvas, "getContext");

    MediaMock.mock(devices["Mac Desktop"]);
    await MediaMock.setSource(canvas);
    await navigator.mediaDevices.getUserMedia({ video: true });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("should stream a canvas that already holds a WebGL context", async () => {
    const canvas = makeConsumerCanvas(640, 480);
    const gl = canvas.getContext("webgl") ?? canvas.getContext("webgl2");
    if (!gl) {
      // No WebGL in this browser/CI image; the getContext contract above still
      // covers the failure mode.
      return;
    }
    gl.clearColor(0, 0, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    MediaMock.mock(devices["Mac Desktop"]);
    await MediaMock.setSource(canvas);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    expect(stream.getVideoTracks()[0].readyState).toBe("live");
  });

  it("should report the canvas's own size rather than a device resolution", async () => {
    const canvas = makeConsumerCanvas(800, 600);

    MediaMock.mock(devices["Mac Desktop"]);
    await MediaMock.setSource(canvas);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    const settings = stream.getVideoTracks()[0].getSettings();

    expect(settings.width).toBe(800);
    expect(settings.height).toBe(600);
  });

  it("should never resize the consumer's canvas, whatever was requested", async () => {
    const canvas = makeConsumerCanvas(800, 600);

    MediaMock.mock(devices["Mac Desktop"]);
    await MediaMock.setSource(canvas);
    await navigator.mediaDevices.getUserMedia({
      video: { width: { exact: 1920 }, height: { exact: 1080 } },
    });

    // Resizing would clear the drawing buffer and desync a 3D renderer's
    // internal size bookkeeping.
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  it("should still honor a frameRate constraint", async () => {
    const canvas = makeConsumerCanvas();

    MediaMock.mock(devices["Mac Desktop"]);
    await MediaMock.setSource(canvas);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { frameRate: { exact: 15 } },
    });

    expect(stream.getVideoTracks()[0].getSettings().frameRate).toBe(15);
  });

  it("should leave the consumer's canvas in the DOM and unstyled after unmock", async () => {
    const canvas = makeConsumerCanvas();
    const styleBefore = canvas.style.cssText;

    MediaMock.mock(devices["Mac Desktop"]);
    await MediaMock.setSource(canvas);
    await navigator.mediaDevices.getUserMedia({ video: true });

    MediaMock.unmock();

    expect(canvas.parentNode).toBe(document.body);
    expect(canvas.style.cssText).toBe(styleBefore);
    expect(canvas.getAttribute("aria-hidden")).toBeNull();
  });

  it("should not restyle the consumer's canvas in debug mode", async () => {
    const canvas = makeConsumerCanvas();

    MediaMock.enableDebugMode().mock(devices["Mac Desktop"]);
    await MediaMock.setSource(canvas);
    await navigator.mediaDevices.getUserMedia({ video: true });

    expect(canvas.style.border).toBe("");
    MediaMock.disableDebugMode();
    expect(canvas.style.cssText).toBe("");
  });

  it("should accept a media URL through setSource as well", async () => {
    MediaMock.mock(devices["Mac Desktop"]);

    await MediaMock.setSource(imageUrl);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    expect(stream.getVideoTracks()[0].readyState).toBe("live");
    expect(MediaMock.settings.mediaURL).toBe(imageUrl);
  });

  it("should accept a custom FrameSource implementation", async () => {
    let framesPainted = 0;
    const customSource = {
      size: { width: 320, height: 240 },
      drawInto(ctx: CanvasRenderingContext2D, width: number, height: number) {
        framesPainted++;
        ctx.fillStyle = "#ff00ff";
        ctx.fillRect(0, 0, width, height);
      },
    };

    MediaMock.mock(devices["Mac Desktop"]);
    await MediaMock.setSource(customSource);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });

    expect(stream.getVideoTracks()[0].readyState).toBe("live");
    expect(framesPainted).toBeGreaterThan(0);
    // A painted source does not dictate the resolution: MediaMock owns the
    // canvas and sizes it from the constraints and the emulated device, exactly
    // as it does for an image. Only a captureCanvas source reports its own size.
    const { width, height } = stream.getVideoTracks()[0].getSettings();
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect({ width, height }).not.toEqual({ width: 320, height: 240 });
  });

  it("should switch from a canvas back to a media URL", async () => {
    const canvas = makeConsumerCanvas();

    MediaMock.mock(devices["Mac Desktop"]);
    await MediaMock.setSource(canvas);
    await navigator.mediaDevices.getUserMedia({ video: true });

    await MediaMock.setSource(imageUrl);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });

    expect(stream.getVideoTracks()[0].readyState).toBe("live");
    // Back to an owned canvas, so the consumer's canvas is untouched.
    expect(canvas.width).toBe(800);
  });
});
