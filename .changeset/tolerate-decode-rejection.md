---
"@eatsjobs/media-mock": patch
---

Stop failing an image source that loaded and draws but whose `decode()` rejects.

WebKit on Linux — Playwright's build, so any CI container running WebKit — rejects `HTMLImageElement.decode()` with `EncodingError` for a 1×1 image, even though the image has loaded and `drawImage` handles it correctly. Measured against the same image with and without CORS, at 1×1 and 2×2, and against a file: only the 1×1 case fails, and only in `decode()`.

The default placeholder source is a 1×1 PNG, so every `getUserMedia` call that was not preceded by an explicit `setSource()` failed outright under WebKit on Linux with `Failed to load image: data:image/png;base64,… EncodingError: Decoding error.`

`decode()` is now advisory. It is still awaited — it is what gets pixel data ready ahead of the first capture — but a rejection no longer fails the load. The 1×1 warmup `drawImage` that follows is the real guarantee that the pixels are usable, and an image that genuinely cannot be drawn still rejects there.
