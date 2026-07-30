---
"@eatsjobs/media-mock": patch
---

Warn when a source swap cannot reach an already-running stream.

A track from `captureStream()` is bound for life to the canvas it was captured from, so a live stream follows a `setSource()` call only while that canvas stays the same. This holds between painted sources — images and videos share the canvas MediaMock owns — but not across the boundary to or from a canvas you render yourself, nor between two different canvases of your own. Previously the stream simply froze on its last frame with no indication why.

Such a swap now logs a warning naming the remedy: request a new stream with `getUserMedia()`. The README documents which swaps a live stream can and cannot follow.
