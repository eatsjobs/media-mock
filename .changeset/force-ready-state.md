---
"@eatsjobs/media-mock": patch
---

Document two separate WebKit-on-Linux defects that make a mocked stream look unready when it is not.

WebKit on Linux — the build Playwright ships and CI containers run — parks a `<video>` fed a `MediaStream` at `HAVE_FUTURE_DATA` (3) and never advances it, even while frames arrive at the requested rate. A bare `canvas.captureStream()` reproduces it with this library not involved, while a plain video file in the same browser reaches 4, and Chromium reaches 4 everywhere.

Separately, and only under a virtual monitor, that same engine never fires `requestVideoFrameCallback`:

| Engine | Mode | `readyState` | rVFC calls | frames decoded |
| --- | --- | --- | --- | --- |
| Chromium | headless | 4 | 170 | 172 |
| Chromium | xvfb | 4 | 177 | 179 |
| WebKit | headless | 3 | 163 | 163 |
| WebKit | xvfb | 3 | 0 | 180 |

It is not a visibility problem: with `document.hidden` false, `visibilityState` visible, `hasFocus()` true and `requestAnimationFrame` ticking normally, rVFC stays at zero whether the canvas and video are visible, `display: none`, offscreen or zero-sized — and `drawImage(video, ...)` returns fresh frames throughout. The frames are decoded and reachable; only the callback is never invoked.

Running WebKit headless restores rVFC. Where the virtual monitor has to stay, a climbing `getVideoPlaybackQuality().totalVideoFrames` is the readiness signal that holds in every case above, and `drawImage` gets at the pixels.

No API change: an earlier draft of this work added a `forceReadyState` option, which is not included. Forcing the property cannot make frames arrive, so under xvfb it would have reported readiness while rVFC stayed silent — moving the hang one step later rather than fixing it.
