---
"@eatsjobs/media-mock": patch
---

Bug fixes and cleanup:

- `unmock()` now restores the native `navigator.mediaDevices` methods even when `mock()` was called multiple times without unmocking in between (previously the native implementations were permanently lost).
- `getSupportedConstraints()` now reflects the currently mocked device instead of always returning the default iPhone 12 constraints.
- Debug mode now actually makes the source image visible (red border, natural size); `disableDebugMode()` hides it again but keeps it in the DOM so webkit doesn't evict its decoded pixel data.
- Video URLs with query strings or fragments (e.g. `video.mp4?token=abc`) are now correctly detected as videos.
- `mock()` clones the device config, so `addMockDevice()`/`removeMockDevice()` no longer mutate the exported `devices` presets across tests.
- `frameRate: { exact: n }` (and `max`) constraints are now honored when deriving the stream FPS.
- `unmock()` resets any custom handler set via `setMockedVideoTracksHandler()`.
- Fixed the `supportedConstraints` type: `Record<keyof MediaTrackSupportedConstraints & "torch", boolean>` resolved to `Record<never, boolean>` and type-checked nothing. It's now the exported `SupportedConstraints` type; `Settings.constraints` is typed accordingly.
- Removed the unused internal `defineProperty` module, deduplicated the video drawing loop, and cleared the image-load timeout timer once loading settles.
