---
"@eatsjobs/media-mock": minor
---

Simulate the camera/microphone permission prompt: `setPermissionState`, `waitForPermissionPrompt` and `answerPermissionPrompt`, with `navigator.permissions.query` mocked for `camera` and `microphone`. While mocked, `query` now reports the mock's state (`"granted"` by default) instead of the browser's; pass `{ permissions: false }` to `mock()` to keep the native behaviour. A simulated `NotReadableError` or `AbortError` now fails after the permission step, as a real device does, so "allowed, but the camera is busy" can be tested; with permissions granted (the default) nothing changes.
