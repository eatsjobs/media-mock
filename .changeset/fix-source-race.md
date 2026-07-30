---
"@eatsjobs/media-mock": patch
---

Fix `getUserMedia()` substituting the default placeholder when a `setSource()` call is still in flight.

`setSource()` assigns the source only once its media has loaded. A caller who did not await it — `MediaMock.setSource(url)` immediately followed by `getUserMedia()` — therefore hit a `getMockStream` that saw no source at all, loaded the built-in 1×1 placeholder, and started capture on a blank white frame. It then *disposed* the real source when it arrived moments later, and only a subsequent redraw switched the stream over. Tests that read the first frames — a barcode scanner, for instance — failed intermittently for reasons that pointed nowhere near the missing `await`.

`getUserMedia()` now waits for an in-flight `setSource()` before deciding what to capture, so the source you asked for is the one that streams. A `setSource()` that rejects still surfaces on its own promise and no longer takes the stream down with it; the default placeholder covers that case as before.
