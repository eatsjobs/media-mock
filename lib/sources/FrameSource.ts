/**
 * A source of frames for the mocked camera stream.
 *
 * A source works one of two ways:
 *
 * - **painted** — it implements {@link FrameSource.drawInto}. MediaMock owns a
 *   canvas, drives a timer at the requested frame rate, and asks the source to
 *   paint each frame. Images and videos work like this.
 * - **captured** — it exposes a {@link FrameSource.captureCanvas} it already
 *   renders into. MediaMock captures that canvas directly and runs no timer, so
 *   the consumer's own render loop drives the stream. A 3D scene works like
 *   this.
 *
 * Provide one or the other. A source owns whatever it creates and must release
 * only that in {@link FrameSource.dispose} — never something handed to it.
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
   *
   * Omit when providing {@link FrameSource.captureCanvas} instead.
   */
  drawInto?(ctx: CanvasRenderingContext2D, width: number, height: number): void;

  /**
   * A canvas this source already renders into. When present, MediaMock captures
   * it as-is: no canvas is created, no rendering context is acquired, and no
   * drawing loop runs. The canvas is never resized, restyled or removed.
   */
  readonly captureCanvas?: HTMLCanvasElement;

  /**
   * Release only what this source created.
   */
  dispose?(): void;
}
