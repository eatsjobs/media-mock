# Migration guide

Upgrading from 1.x reaches the current release through every section below, so read them all — the change most likely to surface in an existing test suite is [`getCapabilities()`](#getcapabilities-now-describes-the-emulated-camera), in 2.0 → 2.1.

## 2.0 → 2.1

No API changed shape, but three requests that used to succeed now fail — in each case because the mock was succeeding where real hardware fails, so a test relying on the old behaviour was never exercising its own failure path.

| Request | 2.0 | 2.1 |
| --- | --- | --- |
| `getUserMedia({})`, `getUserMedia({ video: false })` | resolved with a video stream | rejects with `TypeError` |
| `deviceId: { exact: "unknown" }` | fell back to `facingMode` | rejects with `OverconstrainedError` |
| `width`/`height`/`frameRate` `exact` outside the device's capabilities | snapped to the nearest supported resolution | rejects with `OverconstrainedError` |

If a test asked for a stream it did not actually need, request one kind explicitly:

```diff
-await navigator.mediaDevices.getUserMedia({});
+await navigator.mediaDevices.getUserMedia({ video: true });
```

If it pinned a camera by an id that may not exist, make the hint advisory:

```diff
-video: { deviceId: { exact: someId }, facingMode: "user" }
+video: { deviceId: { ideal: someId }, facingMode: "user" }
```

`ideal` and bare values are unchanged: they stay advisory and never reject.

Microphones are new rather than changed — every preset now lists an `audioinput`, so `enumerateDevices()` returns more entries than it did, and code asserting an exact device count needs updating. See [Audio](./README.md#audio).

---

### `getCapabilities()` now describes the emulated camera

This is the change most likely to show up in an existing test suite, and it reaches anyone coming from 1.x as well.

Until 2.1 the mock only supplied `getCapabilities()` when the track lacked one — and a canvas-capture track always has one, in every engine. So the emulated device's capabilities were never visible; what a consumer read was the capture canvas:

```typescript
// 1.x and 2.0
track.getCapabilities();
// { aspectRatio, deviceId, facingMode, frameRate, height, resizeMode, width }
```

From 2.1 the emulated camera answers, so the features the presets declare are finally reachable:

```typescript
// 2.1 and later, iPhone 12 back camera
track.getCapabilities();
// { …, focusDistance, groupId, torch: true, whiteBalanceMode, zoom: { min: 1, max: 4 } }
```

`deviceId` and `groupId` in the capabilities now match `getSettings()` and an entry in `enumerateDevices()`; before they were the capture's own random id, which matched nothing.

**What this changes for your tests.** Code that feature-detects on capabilities — `if (track.getCapabilities().torch)` — now takes a branch it never took before, and goes on to request that feature. Through 2.3.0 `applyConstraints()` still refused it with `OverconstrainedError: Unsupported constraint`, because the request reached the capture track underneath. From 2.3.1 the mock settles constraints it advertised and reports them in `getSettings()`:

```typescript
await track.applyConstraints({ advanced: [{ torch: true }] });
track.getSettings().torch; // true
```

If you would rather a device did not advertise a feature at all, build it with [`createMediaDeviceInfo`](./README.md#createmediadeviceinfo) and leave that capability out.

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
