/**
 * Delivering `requestVideoFrameCallback` where the browser will not.
 *
 * WebKit on Linux under a virtual monitor decodes frames and advances
 * `currentTime`, but never presents any — and `requestVideoFrameCallback` fires
 * on presentation, so it is never invoked. Measured over three seconds against
 * a canvas stream there: 0 callbacks against 84 decoded frames, while the same
 * browser run headless delivered 83. The frames are real and reachable the
 * whole time; `drawImage(video, ...)` returns fresh content throughout.
 *
 * This stands in for the callback, driven by evidence rather than a timer: a
 * callback fires only once `getVideoPlaybackQuality().totalVideoFrames` has
 * actually advanced. If frames stall, it goes quiet, exactly as the real one
 * would. It cannot manufacture readiness that is not there.
 *
 * Only videos playing a stream this library produced are driven; everything
 * else is handed to the browser's own implementation.
 */

/**
 * How often to look for a new frame. Comfortably below a 60fps frame interval,
 * so the callback is not the thing adding latency.
 */
const POLL_INTERVAL_MS = 8;

/**
 * Handles start high so they cannot collide with the browser's own, which are
 * handed out from a separate sequence and passed to the same `cancel`.
 */
const HANDLE_ORIGIN = 1_000_000;

interface Pending {
  video: HTMLVideoElement;
  callback: VideoFrameRequestCallback;
}

/**
 * Replaces `requestVideoFrameCallback` on `HTMLVideoElement.prototype` while
 * installed.
 */
export class VideoFrameCallbackDriver {
  private restore: VoidFunction | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private nextHandle = HANDLE_ORIGIN;

  private readonly pending = new Map<number, Pending>();
  private readonly delivered = new WeakMap<HTMLVideoElement, number>();

  /** Whether the environment has the callback to stand in for. */
  static isSupported(): boolean {
    return (
      typeof HTMLVideoElement !== "undefined" &&
      typeof HTMLVideoElement.prototype.requestVideoFrameCallback === "function"
    );
  }

  /**
   * @param ownsStream tells whether a stream came from this library, so the
   * browser keeps answering for everyone else's video.
   */
  install(ownsStream: (stream: MediaStream) => boolean): void {
    if (this.restore || !VideoFrameCallbackDriver.isSupported()) {
      return;
    }

    const prototype = HTMLVideoElement.prototype;
    const nativeRequest = prototype.requestVideoFrameCallback;
    const nativeCancel = prototype.cancelVideoFrameCallback;
    const driver = this;

    prototype.requestVideoFrameCallback = function (
      this: HTMLVideoElement,
      callback: VideoFrameRequestCallback,
    ): number {
      const source = this.srcObject;
      const ours =
        source !== null &&
        typeof source === "object" &&
        "getVideoTracks" in source &&
        ownsStream(source as MediaStream);

      return ours
        ? driver.schedule(this, callback)
        : nativeRequest.call(this, callback);
    };

    prototype.cancelVideoFrameCallback = function (
      this: HTMLVideoElement,
      handle: number,
    ): void {
      if (!driver.pending.delete(handle)) {
        nativeCancel.call(this, handle);
      }
    };

    this.timer = setInterval(() => {
      this.deliver();
    }, POLL_INTERVAL_MS);

    this.restore = () => {
      prototype.requestVideoFrameCallback = nativeRequest;
      prototype.cancelVideoFrameCallback = nativeCancel;
    };
  }

  /** Puts the browser's own implementation back and drops any pending work. */
  uninstall(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.pending.clear();
    this.restore?.();
    this.restore = undefined;
  }

  /**
   * Registers `callback` for the video's next frame. The frame count is noted
   * now, so the callback waits for a frame that has yet to arrive — as the
   * browser's own does.
   */
  private schedule(
    video: HTMLVideoElement,
    callback: VideoFrameRequestCallback,
  ): number {
    if (!this.delivered.has(video)) {
      this.delivered.set(video, presentedFrames(video));
    }

    const handle = this.nextHandle++;
    this.pending.set(handle, { video, callback });
    return handle;
  }

  /**
   * Fires every callback whose video has produced a frame since it was
   * registered.
   */
  private deliver(): void {
    // Which videos advanced, resolved before anything fires: several callbacks
    // may be waiting on the same video, and all of them belong to that frame.
    const advanced = new Map<HTMLVideoElement, number>();
    for (const { video } of this.pending.values()) {
      if (advanced.has(video)) {
        continue;
      }
      const presented = presentedFrames(video);
      if (presented > (this.delivered.get(video) ?? 0)) {
        advanced.set(video, presented);
      }
    }

    if (advanced.size === 0) {
      return;
    }
    for (const [video, presented] of advanced) {
      this.delivered.set(video, presented);
    }

    const now = performance.now();
    for (const [handle, { video, callback }] of [...this.pending]) {
      const presented = advanced.get(video);
      if (presented === undefined) {
        continue;
      }

      this.pending.delete(handle);
      callback(now, {
        presentationTime: now,
        expectedDisplayTime: now,
        width: video.videoWidth,
        height: video.videoHeight,
        mediaTime: video.currentTime,
        presentedFrames: presented,
        processingDuration: 0,
      });
    }
  }
}

/** Frames the video has decoded so far, or 0 where it cannot say. */
function presentedFrames(video: HTMLVideoElement): number {
  return video.getVideoPlaybackQuality?.().totalVideoFrames ?? 0;
}
