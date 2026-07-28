---
"@eatsjobs/media-mock": minor
---

Add `getUserMedia` error simulation, so tests can exercise permission-denied, no-camera, and overconstrained paths:

```typescript
MediaMock.mock(devices["iPhone 12"]);
MediaMock.simulateGetUserMediaError("NotAllowedError");

await navigator.mediaDevices.getUserMedia({ video: true });
// rejects with DOMException { name: "NotAllowedError", message: "Permission denied" }

MediaMock.clearGetUserMediaError(); // back to normal streaming
```

- `simulateGetUserMediaError(name, options?)` accepts `"NotAllowedError"`, `"NotFoundError"`, `"NotReadableError"`, `"OverconstrainedError"`, `"AbortError"`, and `"SecurityError"`, each with a realistic default message that can be overridden via `options.message`. `"OverconstrainedError"` takes `options.constraint`.
- The error stays in effect until `clearGetUserMediaError()` or `unmock()`, and a fresh error instance is constructed per call, as in real browsers.
- While `"NotAllowedError"` is simulated, `enumerateDevices()` resolves with redacted entries (`kind` preserved, empty `label`/`deviceId`/`groupId`) instead of rejecting — matching how browsers report devices before permission is granted.
- New exported types: `GetUserMediaErrorName`, `SimulatedErrorOptions`.
