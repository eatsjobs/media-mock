/**
 * Reporting the readiness a mocked stream's frames actually justify.
 *
 * WebKit on Linux — Playwright's build, so any CI container running WebKit —
 * parks a `<video>` fed a `MediaStream` at `HAVE_FUTURE_DATA` (3) and never
 * advances it, even while `currentTime` runs in real time and frames arrive at
 * the requested rate. It is not specific to this library: a bare
 * `canvas.captureStream()` behaves the same way, while a plain video file in
 * the same browser reaches 4. Chromium on Linux and WebKit on macOS both
 * reach 4.
 *
 * Consumers that poll `readyState === 4` before starting therefore wait
 * forever. Waiting on the `playing` event instead is the portable fix and is
 * what the README recommends — but a consumer that cannot be changed (a
 * third-party SDK) needs the property itself to answer.
 *
 * The patch is deliberately narrow. It speaks only for a stream this library
 * produced, and only where the browser has already reached `HAVE_FUTURE_DATA`
 * — which it does once frames are flowing. Every lower value passes through
 * untouched, so nothing ever claims readiness before there is data.
 */

/** The browser has the current frame and at least the one after it. */
const HAVE_FUTURE_DATA = 3;

/** The browser believes it can play to the end without stalling. */
const HAVE_ENOUGH_DATA = 4;

/**
 * Replaces `HTMLMediaElement.prototype.readyState` while installed.
 */
export class ReadyStateReporter {
  private restore: VoidFunction | undefined;

  /** Whether the environment has a media element to patch at all. */
  static isSupported(): boolean {
    return typeof HTMLMediaElement !== "undefined";
  }

  /**
   * @param ownsStream tells whether a stream came from this library, so the
   * patch stays silent about everyone else's.
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

    Object.defineProperty(prototype, "readyState", {
      configurable: true,
      enumerable: native.enumerable,
      get(this: HTMLMediaElement): number {
        const reported = nativeGet.call(this) as number;

        // Anything below HAVE_FUTURE_DATA is the browser saying it does not yet
        // have the frames, which is never ours to contradict.
        if (reported !== HAVE_FUTURE_DATA) {
          return reported;
        }

        const source = this.srcObject;
        return source !== null &&
          typeof source === "object" &&
          "getVideoTracks" in source &&
          ownsStream(source as MediaStream)
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
}
