import type { FrameSource } from "./FrameSource";

/**
 * A canvas the consumer owns and renders into — a Three.js/WebGL scene, a 2D
 * animation, anything that paints itself.
 *
 * MediaMock captures this canvas directly: it creates no canvas of its own,
 * acquires no rendering context, and runs no drawing loop. The consumer's render
 * loop is the frame source.
 *
 * The canvas is deliberately never touched beyond being captured — not resized,
 * restyled, moved in the DOM, or removed. Assigning `width`/`height` would clear
 * a WebGL drawing buffer and desynchronise a renderer's internal size
 * bookkeeping, and the element belongs to the page, not to the mock. For the
 * same reason no `element` is exposed: debug mode must not restyle it.
 */
export class CanvasSource implements FrameSource {
  constructor(private readonly canvas: HTMLCanvasElement) {}

  /** The canvas's own drawing-buffer size, which the mocked track reports. */
  get size(): { width: number; height: number } {
    return { width: this.canvas.width, height: this.canvas.height };
  }

  get captureCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
}
