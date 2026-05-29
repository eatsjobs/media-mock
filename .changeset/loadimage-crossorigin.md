---
"@eatsjobs/media-mock": patch
---

Set `crossOrigin = "anonymous"` on images loaded via `setMediaURL`. Cross-origin sources (e.g. a CDN) previously tainted the capture canvas, causing `captureStream()`/`drawImage` to throw a `SecurityError`. This mirrors the existing behavior of the video source path.
