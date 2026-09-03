---
"@eatsjobs/media-mock": minor
---

Add `forceReadyState` (off by default), and document two separate WebKit-on-Linux defects.

WebKit on Linux — the build Playwright ships and CI containers run — parks a `<video>` fed a `MediaStream` at `HAVE_FUTURE_DATA` (3) and never advances it, even while frames arrive at the requested rate. A bare `canvas.captureStream()` reproduces it with this library not involved, while a plain video file in the same browser reaches 4, and Chromium reaches 4 everywhere.

Separately, and only under a virtual monitor, that same engine never fires `requestVideoFrameCallback`. Measured over six seconds per case:

| Engine | Mode | `readyState` | rVFC calls | frames decoded |
| --- | --- | --- | --- | --- |
| Chromium | headless | 4 | 170 | 172 |
| Chromium | xvfb | 4 | 177 | 179 |
| WebKit | headless | 3 | 163 | 163 |
| WebKit | xvfb | 3 | 0 | 180 |

Under xvfb WebKit decodes frames and advances `currentTime` but never presents any, and rVFC fires on presentation. Running WebKit headless restores it; where the virtual monitor has to stay, a climbing `getVideoPlaybackQuality().totalVideoFrames` is the readiness signal that holds in every case above.

`forceReadyState` addresses the first defect only, for third-party code that polls `readyState === 4` and cannot be edited. It speaks only for streams this library produced, promotes only `HAVE_FUTURE_DATA`, never reaches an engine that reports 4 on its own, and `unmock()` restores the native property.

It is off by default and should stay off unless frames are known to be flowing: forcing the property cannot make frames arrive, so under xvfb it would report readiness while rVFC stays silent, moving the hang one step later rather than fixing it.
