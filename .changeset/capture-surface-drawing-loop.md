---
"@eatsjobs/media-mock": patch
---

Complete the split of `MediaMockClass` into focused modules.

- `lib/captureSurface.ts` — owns the canvas `captureStream()` runs on, and the distinction between one created here and one borrowed from a source. Borrowed canvases are never styled, moved or removed; the webkit-specific reasons for attaching an owned canvas and for reading a pixel back before capture now live next to the code that does it.
- `lib/drawingLoop.ts` — the repaint timer, including `TimerMode` and the rAF-versus-`setInterval` decision. `TimerMode` is re-exported from the entry point, so `import { TimerMode }` is unchanged.
- `lib/debugView.ts` — all show/hide styling for the canvas and source elements, replacing `lib/sources/elementVisibility.ts`.

`lib/main.ts` drops from 820 to 660 lines.

The timer logic gains unit tests it never had: mode resolution including the hidden-page and missing-rAF fallbacks, the loop's immediate first draw, interval cadence, rAF throttling, restart and teardown.
