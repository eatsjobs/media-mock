# Migration guide

## 1.x → 2.0

Two breaking changes. Both are mechanical, and a typical upgrade is a find-and-replace plus one edit per settings write.

At a glance:

| 1.x | 2.0 |
| --- | --- |
| `await MediaMock.setMediaURL(url)` | `await MediaMock.setSource(url)` |
| `MediaMock.settings.canvasScaleFactor = 0.8` | `MediaMock.configure({ canvasScaleFactor: 0.8 })` |
| `MediaMock.settings.mediaTimeout = 30_000` | `MediaMock.configure({ mediaTimeout: 30_000 })` |
| `MediaMock.settings.timerMode = TimerMode.Raf` | `MediaMock.configure({ timerMode: TimerMode.Raf })` |
| *(no equivalent)* | `createMediaMock()` for an isolated instance |

Everything else is unchanged: `mock`, `unmock`, `enableDebugMode`, `disableDebugMode`, `addMockDevice`, `removeMockDevice`, `setMockedVideoTracksHandler`, `simulateGetUserMediaError`, `clearGetUserMediaError`, `setCanvasScaleFactor`, `setMediaTimeout`, `setTimerMode`, `TimerMode`, `devices`, and `createMediaDeviceInfo`.

---

### 1. `setMediaURL()` → `setSource()`

```diff
-await MediaMock.setMediaURL("./assets/frame.png");
+await MediaMock.setSource("./assets/frame.png");
```

`setMediaURL` is **removed, not deprecated**. It is absent from the compiled JavaScript and from the type declarations, so a missed call site fails loudly:

```
TypeError: MediaMock.setMediaURL is not a function
```

`setSource()` takes the same URLs — images and videos, chosen by extension — and additionally accepts things `setMediaURL` could not express:

```typescript
await MediaMock.setSource(renderer.domElement);  // a canvas you render into
await MediaMock.setSource(myFrameSource);         // a custom FrameSource
```

**Why one method rather than keeping both:** "what does the mocked camera show" is one question, and answering it in two places invites the two to drift. See [Streaming Your Own Canvas](./README.md#streaming-your-own-canvas-3d-scenes).

### 2. `settings` is read-only

Reading is unchanged:

```typescript
MediaMock.settings.mediaURL;            // still works
MediaMock.settings.device;              // still works
MediaMock.settings.canvasScaleFactor;   // still works
```

Writing now goes through `configure()`:

```diff
-MediaMock.settings.canvasScaleFactor = 0.8;
-MediaMock.settings.mediaTimeout = 30_000;
-MediaMock.settings.timerMode = TimerMode.Raf;
+MediaMock.configure({
+  canvasScaleFactor: 0.8,
+  mediaTimeout: 30_000,
+  timerMode: TimerMode.Raf,
+});
```

`settings` returns a frozen snapshot, so an assignment throws a `TypeError` in strict mode (which includes all ES modules) rather than being silently dropped. Only `canvasScaleFactor`, `mediaTimeout` and `timerMode` were ever meaningful to set by hand — `mediaURL`, `device` and `constraints` are owned by `setSource()` and `mock()`, and writing them directly never had a defined effect.

If you prefer the single-purpose setters, they still exist and now delegate to `configure()`:

```typescript
MediaMock.setCanvasScaleFactor(0.8).setMediaTimeout(30_000);
```

**Why:** `settings` was mutable public state that the library also wrote to internally. Two bugs fixed in 1.4.0 came from exactly that kind of shared mutable state leaking between tests.

---

### Optional: isolate instances in tests

`MediaMock` is a shared singleton. If a test forgets `unmock()`, its configuration, device list and simulated errors carry into the next test file. `createMediaMock()` removes the possibility:

```typescript
import { createMediaMock, devices } from "@eatsjobs/media-mock";

const mock = createMediaMock();

beforeEach(() => {
  mock.mock(devices["iPhone 12"]);
});

afterEach(() => {
  mock.unmock();
});
```

`navigator.mediaDevices` is global, so only one instance should be mocking at a time — this isolates *your* state, not the browser's.

No change is required; the singleton keeps working.

---

### Checklist

- [ ] Replace `setMediaURL(` with `setSource(`
- [ ] Replace direct `settings.*` assignments with `configure({ ... })`
- [ ] Type-check: TypeScript flags both changes, so a clean `tsc` means you are done
- [ ] Optional: adopt `createMediaMock()` in test setup
