---
"@eatsjobs/media-mock": minor
---

Add `forceReadyState`, for consumers that poll `readyState === 4` on a browser that never reports it.

WebKit on Linux — Playwright's build, so any CI container running WebKit — parks a `<video>` fed a `MediaStream` at `HAVE_FUTURE_DATA` (3) and never advances it, even while `currentTime` runs in real time and frames arrive at the requested rate. Measured against a bare `canvas.captureStream()` with this library not involved at all: same result, while a plain video file in the same browser reaches 4, and Chromium on Linux and WebKit on macOS both reach 4. So it is the engine, not the mock.

Code that waits on the `playing` event, `canplay`, or `requestVideoFrameCallback` is unaffected and remains the portable approach. Code that polls the property never starts — and when that code is a third-party SDK, it cannot be changed:

```typescript
MediaMock.mock(devices["iPhone 12"], { forceReadyState: true });
```

The patch is deliberately narrow. It speaks only for streams this library produced, and only once the browser has already reached `HAVE_FUTURE_DATA` — the point at which frames are flowing. Every lower value passes through untouched, so nothing claims readiness before there is data, and other media on the page is unaffected. `unmock()` restores the native property.

Off by default: it reports something the platform does not, which should be a decision rather than a surprise.
