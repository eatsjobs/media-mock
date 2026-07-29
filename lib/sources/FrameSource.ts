/**
 * A source of frames for the mocked camera stream.
 *
 * MediaMock owns a canvas, drives a timer at the requested frame rate, and asks
 * the source to paint each frame via {@link FrameSource.drawInto}. A source owns
 * whatever it creates (an `<img>`, a `<video>`) and must release only that in
 * {@link FrameSource.dispose}.
 */
export interface FrameSource {
  /**
   * Intrinsic size of the underlying media, in pixels. Zero on either axis
   * means "not loaded yet" — reported for debugging, not used for capture.
   */
  readonly size: { width: number; height: number };

  /**
   * The DOM element backing this source, when there is one. Exposed so debug
   * mode can make it visible; the source itself stays unaware of debug state.
   */
  readonly element?: HTMLElement;

  /**
   * Load whatever the source needs before capture starts. May reject — for
   * example on a network failure or a load timeout.
   */
  prepare?(): Promise<void>;

  /**
   * Paint one frame into the capture canvas. Called on every tick of the
   * drawing loop, so it must be cheap and must not allocate per frame.
   */
  drawInto(ctx: CanvasRenderingContext2D, width: number, height: number): void;

  /**
   * Release only what this source created.
   */
  dispose?(): void;
}
