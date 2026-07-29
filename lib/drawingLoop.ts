/**
 * Driving the repaint of the capture canvas at a requested frame rate.
 */

/**
 * Controls the timer used for the canvas drawing loop that feeds captureStream.
 *
 * - `Auto` — uses `setInterval` when `requestAnimationFrame` may be throttled
 *   (detected by checking `document.hidden`), otherwise uses `requestAnimationFrame`.
 * - `Raf` — always uses `requestAnimationFrame`.
 * - `SetInterval` — always uses `setInterval`. More reliable in headless/virtual
 *   display environments (e.g. xvfb) where webkit throttles rAF for inactive pages,
 *   causing `captureStream` to stop emitting frames.
 */
export enum TimerMode {
  Auto = "auto",
  Raf = "raf",
  SetInterval = "setInterval",
}

/** Check if RequestAnimationFrame is supported */
export function isRAFSupported(): boolean {
  return typeof requestAnimationFrame === "function";
}

/**
 * Resolves the effective timer mode. "auto" uses setInterval when the document
 * is hidden (e.g. under xvfb where webkit throttles rAF), otherwise rAF.
 */
export function resolveTimerMode(
  mode: TimerMode,
): TimerMode.Raf | TimerMode.SetInterval {
  if (mode === TimerMode.Raf) return TimerMode.Raf;
  if (mode === TimerMode.SetInterval) return TimerMode.SetInterval;

  // Auto: fall back to setInterval when the page may not be compositing
  const pageHidden =
    typeof document !== "undefined" &&
    typeof document.hidden !== "undefined" &&
    document.hidden;
  return pageHidden || !isRAFSupported()
    ? TimerMode.SetInterval
    : TimerMode.Raf;
}

/**
 * Repeatedly calls a draw callback, either via `requestAnimationFrame` (throttled
 * to the requested frame rate, since rAF fires at display rate) or `setInterval`.
 */
export class DrawingLoop {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private rafId: ReturnType<typeof requestAnimationFrame> | null = null;
  private lastDrawTime: number = 0;

  /** Whether a loop is currently scheduled. */
  get running(): boolean {
    return this.intervalId !== null || this.rafId !== null;
  }

  /**
   * Draws one frame immediately, then schedules the rest.
   *
   * The synchronous first draw matters: `captureStream` otherwise starts on a
   * blank canvas.
   */
  start(
    draw: () => void,
    { fps, mode }: { fps: number; mode: TimerMode },
  ): void {
    this.stop();

    draw();

    const frameInterval = 1000 / fps;
    this.lastDrawTime = performance.now();

    if (resolveTimerMode(mode) === TimerMode.Raf && isRAFSupported()) {
      const rafLoop = () => {
        const now = performance.now();
        if (now - this.lastDrawTime >= frameInterval) {
          draw();
          this.lastDrawTime = now;
        }
        this.rafId = requestAnimationFrame(rafLoop);
      };
      this.rafId = requestAnimationFrame(rafLoop);
    } else {
      // setInterval fires reliably even when rAF is throttled (e.g. webkit under xvfb)
      this.intervalId = setInterval(draw, frameInterval);
    }
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.lastDrawTime = 0;
  }
}
