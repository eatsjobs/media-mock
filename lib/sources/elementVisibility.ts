/**
 * Showing and hiding the DOM elements MediaMock attaches to the page.
 *
 * Source elements stay in the document even when invisible: some webkit
 * versions evict a detached image's decoded pixel data from GPU memory, which
 * makes `drawImage` paint blank frames.
 */

const HIDDEN_STYLES =
  "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";

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
  element.style.cssText = "border:10px solid red";
  element.removeAttribute("aria-hidden");
}
