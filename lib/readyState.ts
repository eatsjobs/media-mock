/**
 * Reporting the readiness that arriving frames justify.
 *
 * WebKit on Linux never *presents* frames from a `MediaStream`, and both of a
 * media element's readiness signals are derived from presentation: the browser
 * neither fires `requestVideoFrameCallback` nor advances `readyState` past
 * `HAVE_FUTURE_DATA`. Measured over six seconds against a mocked stream there,
 * `readyState` reached 4 in none of headless, xvfb, with the frame-callback
 * driver installed or without — while frames decoded at roughly 28fps
 * throughout. Consumers that poll `readyState === 4` therefore wait forever.
 *
 * This reports `HAVE_ENOUGH_DATA` in that situation, on the same evidence the
 * frame-callback driver uses: the video's decoded frame count actually
 * advancing. It never speaks before a frame has demonstrably arrived, and it
 * withdraws again if frames stop — so it cannot disguise a stalled stream,
 * which is the one thing a readiness signal must not do.
 */

/** The browser has the current frame and at least the one after it. */
const HAVE_FUTURE_DATA = 3;

/** The browser believes it can play on without stalling. */
const HAVE_ENOUGH_DATA = 4;

/**
 * How long frames may pause before readiness is withdrawn.
 *
 * Without this, a consumer polling faster than the frame rate would see the
 * answer flicker between 3 and 4 as it caught the gaps between frames.
 */
const STALL_TOLERANCE_MS = 500;

interface Progress {
  frames: number;
  at: number;
  /** Whether a frame has actually been seen to arrive for this element. */
  confirmed: boolean;
}

/**
 * Replaces `HTMLMediaElement.prototype.readyState` while installed.
 */
export class ReadyStateReporter {
  private restore: VoidFunction | undefined;
  private readonly progress = new WeakMap<HTMLMediaElement, Progress>();

  /** Whether the environment has a media element to report for. */
  static isSupported(): boolean {
    return typeof HTMLMediaElement !== "undefined";
  }

  /**
   * @param ownsStream tells whether a stream came from this library, so the
   * browser keeps answering for every other element on the page.
   */
  install(ownsStream: (stream: MediaStream) => boolean): void {
    if (this.restore || !ReadyStateReporter.isSupported()) {
      return;
    }

    const prototype = HTMLMediaElement.prototype;
    const native = Object.getOwnPropertyDescriptor(prototype, "readyState");
    if (!native?.get || !native.configurable) {
      return;
    }

    const nativeGet = native.get;
    const reporter = this;

    Object.defineProperty(prototype, "readyState", {
      configurable: true,
      enumerable: native.enumerable,
      get(this: HTMLMediaElement): number {
        const reported = nativeGet.call(this) as number;

        // Anything lower is the browser saying it does not have the frames,
        // which is never ours to contradict.
        if (reported !== HAVE_FUTURE_DATA) {
          return reported;
        }

        const source = this.srcObject;
        const ours =
          source !== null &&
          typeof source === "object" &&
          "getVideoTracks" in source &&
          ownsStream(source as MediaStream);

        return ours && reporter.framesAreArriving(this)
          ? HAVE_ENOUGH_DATA
          : reported;
      },
    });

    this.restore = () => {
      Object.defineProperty(prototype, "readyState", native);
    };
  }

  /** Puts the native getter back. */
  uninstall(): void {
    this.restore?.();
    this.restore = undefined;
  }

  /**
   * Whether frames are currently arriving for `element`.
   *
   * False until one has been seen to arrive, then steady across rapid polling,
   * then false again once they stop.
   */
  private framesAreArriving(element: HTMLMediaElement): boolean {
    const frames =
      (element as HTMLVideoElement).getVideoPlaybackQuality?.()
        .totalVideoFrames ?? 0;
    const now = performance.now();
    const previous = this.progress.get(element);

    if (previous === undefined) {
      // Nothing to compare against yet, so nothing is proven yet.
      this.progress.set(element, { frames, at: now, confirmed: false });
      return false;
    }

    if (frames > previous.frames) {
      this.progress.set(element, { frames, at: now, confirmed: true });
      return true;
    }

    // Between frames: hold the previous answer briefly so it does not flicker,
    // but only once a frame has actually been seen.
    return previous.confirmed && now - previous.at < STALL_TOLERANCE_MS;
  }
}
