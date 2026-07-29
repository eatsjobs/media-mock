---
"@eatsjobs/media-mock": major
---

**Breaking:** `setMediaURL()` is replaced by `setSource()`, and `settings` is now read-only.

```diff
-await MediaMock.setMediaURL("./assets/frame.png");
+await MediaMock.setSource("./assets/frame.png");

-MediaMock.settings.canvasScaleFactor = 0.8;
+MediaMock.configure({ canvasScaleFactor: 0.8 });
```

`setSource()` accepts everything `setMediaURL` did, plus an `HTMLCanvasElement` or a custom `FrameSource`. `settings` remains readable and is now a frozen snapshot, so an accidental assignment throws instead of being silently ignored; `setCanvasScaleFactor`, `setMediaTimeout` and `setTimerMode` keep working as shorthands for `configure()`.

Added `createMediaMock()`, which returns an independent instance. Two instances share no configuration, device list, source or simulated error, so state cannot leak between test files through the shared singleton — the cause of two bugs fixed in 1.4.0. `MediaMock` remains the default export and the documented path.

Nothing else changes: `mock`, `unmock`, `enableDebugMode`, `addMockDevice`, `setMockedVideoTracksHandler`, `simulateGetUserMediaError`, `TimerMode` and `devices` all behave as before.
