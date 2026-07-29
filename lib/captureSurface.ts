import { hideCanvasOffscreen } from "./debugView";
import type { Resolution } from "./resolution";
import type { FrameSource } from "./sources/FrameSource";

/**
 * The canvas that `captureStream()` is called on.
 *
 * Either created here for a source that paints frames, or borrowed from a source
 * that already renders its own canvas. Borrowed canvases belong to the consumer's
 * page and are never styled, moved or removed.
 */
export class CaptureSurface {
  private constructor(
    readonly canvas: HTMLCanvasElement,
    /** 2D context, only for a canvas we created and paint into. */
    readonly ctx: CanvasRenderingContext2D | undefined,
    /** Whether this canvas was created here. */
    readonly owned: boolean,
    /** Size the captured track will report. */
    readonly resolution: Resolution,
  ) {}

  /**
   * Borrows the source's own canvas. No context is acquired — a canvas holding a
   * WebGL context has no 2D context to give — and nothing about it is modified.
   */
  static borrow(canvas: HTMLCanvasElement): CaptureSurface {
    return new CaptureSurface(canvas, undefined, false, {
      width: canvas.width,
      height: canvas.height,
    });
  }

  /**
   * Creates a canvas at `resolution`, primed white and attached offscreen.
   *
   * The canvas must live in the document for `captureStream()` to produce a track
   * whose intrinsic dimensions stay stable: on some browser versions (e.g. a
   * WebKit 26-class engine under xvfb) a detached canvas yields a track whose
   * videoWidth/videoHeight briefly report valid values and then drop to 2x2,
   * breaking `<video>` consumers.
   */
  static create(resolution: Resolution, canvasId: string): CaptureSurface {
    const canvas = document.createElement("canvas");
    canvas.id = canvasId;
    canvas.width = resolution.width;
    canvas.height = resolution.height;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Failed to get 2D canvas context");
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, resolution.width, resolution.height);

    hideCanvasOffscreen(canvas);
    if (typeof document.body !== "undefined" && document.body !== null) {
      document.body.append(canvas);
    }

    return new CaptureSurface(canvas, ctx, true, { ...resolution });
  }

  /**
   * Chooses the right surface for a source: borrow its canvas when it has one,
   * otherwise create one at the requested resolution.
   */
  static forSource(
    source: FrameSource,
    resolution: Resolution,
    canvasId: string,
  ): CaptureSurface {
    return source.captureCanvas
      ? CaptureSurface.borrow(source.captureCanvas)
      : CaptureSurface.create(resolution, canvasId);
  }

  /**
   * Paints one frame, then reads a pixel back.
   *
   * The readback forces the pixels to commit: on some webkit versions drawing to
   * a freshly created canvas does not commit until something reads, so capture
   * would otherwise start on a blank frame. A borrowed canvas paints itself.
   */
  paint(source: FrameSource): void {
    if (!this.ctx) {
      return;
    }
    source.drawInto?.(this.ctx, this.resolution.width, this.resolution.height);
  }

  /** Flushes pending GPU work so the first captured frame is not blank. */
  commitPixels(): void {
    this.ctx?.getImageData(0, 0, 1, 1);
  }

  /**
   * Detaches the canvas if we created it. A borrowed canvas is left untouched.
   */
  release(): void {
    if (this.owned && this.canvas.parentNode) {
      this.canvas.remove();
    }
  }
}
