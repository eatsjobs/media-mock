---
"@eatsjobs/media-mock": minor
---

Report `HAVE_ENOUGH_DATA` on WebKitGTK, where the browser never does.

WebKitGTK — WebKit on Linux, which is the build Playwright ships and CI containers run — parks a `<video>` fed a `MediaStream` at `HAVE_FUTURE_DATA` (3) and never advances it, even while `currentTime` runs in real time and frames arrive at the requested rate. WebKit on macOS and on real machines reaches 4, as does Chromium everywhere, so it is a limitation of that one port. Measured against a bare `canvas.captureStream()` with this library not involved at all: same result there, while a plain video file in the same browser reaches 4.

Consumers that poll `readyState === 4` before starting — a third-party SDK you cannot edit, typically — therefore never start under CI, while the same code works everywhere else.

`mock()` now corrects this by default. The patch cannot fire anywhere the browser is behaving:

- only streams this library produced are spoken for, so other media on the page is untouched;
- only `HAVE_FUTURE_DATA` is promoted, so nothing claims readiness before the browser has the frames;
- an engine that reports 4 on its own never reaches the code;
- `unmock()` restores the native property.

Pass `forceReadyState: false` to see the browser's own value, which is worth doing if readiness handling is itself what you are testing.

Waiting on `playing`, `canplay` or `requestVideoFrameCallback` remains the portable approach for code that also runs against real cameras, and the README still recommends it.
