/**
 * Showing and hiding the DOM elements MediaMock puts on the page.
 *
 * Everything stays in the document even when invisible: a detached canvas makes
 * `captureStream` report unstable track dimensions, and some webkit versions
 * evict a detached image's decoded pixel data from GPU memory, which makes
 * `drawImage` paint blank frames.
 */

const HIDDEN_STYLES =
  "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";

const DEBUG_BORDER = "10px solid red";

/**
 * Parks an element offscreen and invisible while keeping it in the document.
 */
export function hideOffscreen(element: HTMLElement): void {
  element.style.cssText = HIDDEN_STYLES;
  element.setAttribute("aria-hidden", "true");
}

/**
 * Restores an element to its natural size and makes it visible with a red
 * border, so debug mode shows what is being captured.
 */
export function showForDebug(element: HTMLElement): void {
  element.style.cssText = `border:${DEBUG_BORDER}`;
  element.removeAttribute("aria-hidden");
}

/**
 * Positions the capture canvas offscreen but keeps it at its natural
 * drawing-buffer size, so captureStream sees a non-zero rendering rectangle.
 *
 * On some webkit versions, shrinking the displayed canvas with CSS width/height
 * collapses the captured track's intrinsic dimensions — hence moving it offscreen
 * via `left: -9999px` rather than resizing it.
 */
export function hideCanvasOffscreen(canvas: HTMLCanvasElement): void {
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "-9999px";
  canvas.style.width = "";
  canvas.style.height = "";
  canvas.style.opacity = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.border = "";
  canvas.setAttribute("aria-hidden", "true");
}

/**
 * Restores the capture canvas to its natural size and makes it visible.
 */
export function showCanvasForDebug(canvas: HTMLCanvasElement): void {
  canvas.style.position = "";
  canvas.style.top = "";
  canvas.style.left = "";
  canvas.style.width = "";
  canvas.style.height = "";
  canvas.style.opacity = "";
  canvas.style.pointerEvents = "";
  canvas.style.border = DEBUG_BORDER;
  canvas.removeAttribute("aria-hidden");
}

/** Id of the debug-mode label showing what the consumer receives. */
export const FRAME_STATS_ID = "media-mock-frame-stats";

/** The pixel format of the frame `video` is showing, as WebCodecs reads it. */
function formatOf(video: HTMLVideoElement): string {
  try {
    const frame = new VideoFrame(video);
    const { format } = frame;
    frame.close();
    return format ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * A thumbnail of a track with the format and rate of the frames it delivers,
 * read the way a consumer reads them — so debug mode shows which output a test
 * actually exercises.
 */
export class FrameStats {
  private element: HTMLElement | undefined;

  show(track: MediaStreamTrack): void {
    this.hide();

    const container = document.createElement("figure");
    container.id = FRAME_STATS_ID;
    container.style.cssText = `position:fixed;right:0;bottom:0;margin:0;z-index:2147483647;pointer-events:none;background:#000;color:#fff;font:12px monospace;border:${DEBUG_BORDER}`;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.style.cssText = "display:block;width:160px";
    video.srcObject = new MediaStream([track]);
    const label = document.createElement("figcaption");
    label.textContent = "waiting for frames";
    container.append(video, label);
    document.body?.append(container);
    this.element = container;

    if (typeof video.requestVideoFrameCallback !== "function") {
      return;
    }
    let frames = 0;
    let since = performance.now();
    const onFrame = () => {
      if (this.element !== container) {
        return;
      }
      frames++;
      const elapsed = performance.now() - since;
      if (elapsed >= 1000) {
        const fps = Math.round((frames * 1000) / elapsed);
        label.textContent = `${formatOf(video)} · ${fps} fps`;
        frames = 0;
        since = performance.now();
      }
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  }

  hide(): void {
    const video = this.element?.querySelector("video");
    if (video) {
      video.srcObject = null;
    }
    this.element?.remove();
    this.element = undefined;
  }
}
