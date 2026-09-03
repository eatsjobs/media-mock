---
"@eatsjobs/media-mock": minor
---

Add `emulateVideoFrameCallback`, and document two WebKit-on-Linux defects that make a healthy mocked stream look unready.

WebKit on Linux — the build Playwright ships and CI containers run — parks a `<video>` fed a `MediaStream` at `HAVE_FUTURE_DATA` (3) and never advances it. A bare `canvas.captureStream()` reproduces it with this library not involved, while a plain video file in the same browser reaches 4, and Chromium reaches 4 everywhere.

Separately, and only under a virtual monitor, that same engine never fires `requestVideoFrameCallback`:

| Engine | Mode | `readyState` | rVFC calls | frames decoded |
| --- | --- | --- | --- | --- |
| Chromium | headless | 4 | 170 | 172 |
| Chromium | xvfb | 4 | 177 | 179 |
| WebKit | headless | 3 | 163 | 163 |
| WebKit | xvfb | 3 | 0 | 180 |

It is not a visibility problem. With `document.hidden` false, `visibilityState` visible, `hasFocus()` true and `requestAnimationFrame` ticking normally, rVFC stays at zero whether the canvas and video are visible, `display: none`, offscreen or zero-sized — and `drawImage(video, ...)` returns fresh frames throughout. The frames are decoded and reachable; only the callback is never invoked.

Running WebKit headless restores it. Where the virtual monitor has to stay, `emulateVideoFrameCallback` delivers the callback instead:

```typescript
MediaMock.mock(devices["iPhone 12"], { emulateVideoFrameCallback: true });
```

Measured through the built bundle under xvfb: 0 callbacks against 83 decoded frames by default, 84 against 84 with the option on.

It reports frames rather than inventing them — a callback fires only once the video's decoded frame count has advanced, so a stalled stream goes quiet exactly as it would with the real implementation. Videos playing anything else keep the browser's own implementation, and `unmock()` restores it. Off by default, since every other engine and mode delivers the callback itself.

`getVideoPlaybackQuality().totalVideoFrames` climbing, `currentTime` advancing, and the `playing` and `canplay` events all work in every case above and need no option.
