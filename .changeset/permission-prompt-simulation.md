---
"@eatsjobs/media-mock": minor
---

Simulate the camera/microphone permission prompt: `setPermissionState`, `waitForPermissionPrompt` and `answerPermissionPrompt`, with `navigator.permissions.query` mocked for `camera` and `microphone`. While mocked, `query` now reports the mock's state (`"granted"` by default) instead of the browser's; pass `{ permissions: false }` to `mock()` to keep the native behaviour.
