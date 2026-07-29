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
