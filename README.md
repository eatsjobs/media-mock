# @eatsjobs/media-mock

Media-Mock is a JavaScript library that simulates media devices (like webcams) in web applications, allowing developers to test and debug media constraints, device configurations, and stream functionality without needing physical devices. This is particularly useful in scenarios where hardware or user permissions aren't available or desired, such as in automated testing environments.

Can also be used as browser extension please have a look at this repo [https://github.com/eatsjobs/media-mock-extension](https://github.com/eatsjobs/media-mock-extension)

---

![npm version](https://img.shields.io/npm/v/@eatsjobs/media-mock)
![build](https://img.shields.io/github/actions/workflow/status/eatsjobs/media-mock/release.yml?branch=main)
![license](https://img.shields.io/github/license/eatsjobs/media-mock)
![issues](https://img.shields.io/github/issues/eatsjobs/media-mock)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/types-TypeScript-blue)
![Node Version](https://img.shields.io/node/v/@eatsjobs/media-mock)
[![codecov](https://codecov.io/gh/eatsjobs/media-mock/graph/badge.svg?token=K6INB2LZ8W)](https://codecov.io/gh/eatsjobs/media-mock)

## Table of Contents

- [Installation](#installation)
  - [CDN](#cdn)
- [Usage](#usage)
  - [Configuring a Custom Device and Constraints](#configuring-a-custom-device-and-constraints)
  - [Configuring Media Load Timeout](#configuring-media-load-timeout)
  - [Controlling the Drawing Timer (headless/CI)](#controlling-the-drawing-timer-headlessci)
  - [Streaming Your Own Canvas (3D scenes)](#streaming-your-own-canvas-3d-scenes)
  - [Audio](#audio)
  - [Constraints the device cannot meet](#constraints-the-device-cannot-meet)
  - [Simulating Errors](#simulating-errors)
  - [Creating Custom Mock Devices](#creating-custom-mock-devices)
- [Migrating to 2.0](#migrating-to-20) · [full guide](./MIGRATION.md)
- [API Documentation](#api-documentation)
  - [MediaMock](#mediamock)
  - [createMediaMock](#createmediamock)
  - [TimerMode](#timermode)
  - [GetUserMediaErrorName](#getusermediaerrorname)
  - [createMediaDeviceInfo](#createmediadeviceinfo)
  - [Settings and ConfigurableSettings](#settings)
  - [MockOptions](#mockoptions)
  - [DeviceConfig](#deviceconfig)
- [Testing with Playwright](#testing-with-playwright)
- [Unit testing without a browser](#unit-testing-without-a-browser)
- [Debugging](#debugging)

---

## Key Features

- **Device Simulation**: Simulate configurations for various devices like iPhone, desktop, or custom configurations.
- **Constraint Support**: Set custom video constraints such as resolution, frame rate, and more.
- **Canvas-based Mock Stream**: Use an image as a video input source and capture it as a canvas stream.
- **Debug Mode**: Visualize the mock stream by displaying the canvas and image in the DOM.
- **Easy Integration with Testing**: Ideal for testing media applications with tools like Vitest, Jest or Playwright.
- **Headless-Friendly Timer Modes**: Choose how frames are pushed to the stream (`requestAnimationFrame`, `setInterval`, or automatic) for reliable capture under headless / virtual displays (e.g. `xvfb`).
- **Custom Mock Devices**: Build your own `MediaDeviceInfo` entries (with capabilities like `torch`, `zoom`, etc.) via `createMediaDeviceInfo`.
- **Microphones**: Every preset exposes an `audioinput` (and, where the real device has one, an `audiooutput`). `getUserMedia({ audio: true })` returns a live, silent audio track carrying the emulated microphone's identity.
- **Real Refusals**: Mandatory constraints (`exact`, `min`, `max`) the emulated device cannot meet are rejected with `OverconstrainedError`, naming the offending constraint — as a real camera does — instead of being quietly snapped to something else.
- **Error Simulation**: Make `getUserMedia` reject with realistic errors (`NotAllowedError`, `NotFoundError`, `OverconstrainedError`, ...) to test permission-denied and no-camera paths.
- **Bring Your Own Canvas**: Stream a canvas you render into — a WebGL/Three.js 3D scene, or procedural frames via a custom `FrameSource`.
- **Isolated Instances**: `createMediaMock()` gives each test file its own instance, so configuration and device state cannot leak between them.

---

## Installation

Install with npm:

[NPM](https://www.npmjs.com/package/@eatsjobs/media-mock) or
[JSR](https://jsr.io/@eatsjobs/media-mock)

```bash
npm install @eatsjobs/media-mock
```

Install with jsr:

```bash
npx jsr add @eatsjobs/media-mock
```

### CDN

Include directly in your HTML via [jsDelivr](https://www.jsdelivr.com/) or [unpkg](https://unpkg.com/):

**jsDelivr** (recommended):

```html
<!-- Latest version -->
<script src="https://cdn.jsdelivr.net/npm/@eatsjobs/media-mock"></script>

<!-- Specific version -->
<script src="https://cdn.jsdelivr.net/npm/@eatsjobs/media-mock@2.0.0"></script>
```

**unpkg**:

```html
<!-- Latest version -->
<script src="https://unpkg.com/@eatsjobs/media-mock"></script>

<!-- Specific version -->
<script src="https://unpkg.com/@eatsjobs/media-mock@2.0.0"></script>
```

When loaded via CDN, `MediaMock` and `devices` are available on the global `window.MediaMock` object:

```html
<script src="https://cdn.jsdelivr.net/npm/@eatsjobs/media-mock"></script>
<script>
  const { MediaMock, devices } = window.MediaMock;

  MediaMock.mock(devices["iPhone 12"]);
  await MediaMock.setSource("./assets/640x480-sample.png");
</script>
```

## Usage

Basic Usage

To start using MediaMock, initialize the library, configure a mock media stream, and then request a stream from navigator.mediaDevices.

```typescript
import { MediaMock, devices } from "@eatsjobs/media-mock";

// Configure and initialize MediaMock with default settings
MediaMock.mock(devices["iPhone 12"]); // or devices["Samsung Galaxy M53"] for Android, "Mac Desktop" for desktop mediaDevice emulation
await MediaMock.setSource("./assets/640x480-sample.png");

// Set up a video element to display the stream
const videoElement = document.createElement("video");
document.body.appendChild(videoElement);

videoElement.srcObject = await navigator.mediaDevices.getUserMedia({ video: true });
videoElement.play();

const enumeratedDevices = await navigator.mediaDevices.enumerateDevices();
const supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
console.log(enumeratedDevices, supportedConstraints);
```

## Configuring a Custom Device and Constraints

You can set a specific device and define video constraints such as resolution and frame rate.

```typescript
MediaMock.mock(devices["Mac Desktop"]);
await MediaMock.setSource("./assets/640x480-sample.png");
```

## Configuring Media Load Timeout

You can adjust the timeout for media loading based on your network conditions or test requirements. The default timeout is 60 seconds for both images and videos.

```typescript
import { MediaMock, devices } from "@eatsjobs/media-mock";

MediaMock.mock(devices["iPhone 12"]);

// Set a custom timeout of 30 seconds (useful for faster tests)
MediaMock.setMediaTimeout(30 * 1000);
await MediaMock.setSource("./assets/640x480-sample.png");

// Or set a longer timeout for slow networks
MediaMock.setMediaTimeout(5 * 60 * 1000); // 5 minutes
await MediaMock.setSource("./assets/video.mp4");

// Or set several options at once
MediaMock.configure({
  mediaTimeout: 45 * 1000,
  canvasScaleFactor: 0.8,
});
```

## Controlling the Drawing Timer (headless/CI)

The mock stream is produced by drawing the source image/video onto a canvas in a loop and capturing it with `captureStream()`. The `TimerMode` setting controls which timer drives that loop:

- `TimerMode.Auto` — uses `setInterval` when `requestAnimationFrame` may be throttled (detected via `document.hidden`), otherwise uses `requestAnimationFrame`.
- `TimerMode.Raf` — always uses `requestAnimationFrame`.
- `TimerMode.SetInterval` — always uses `setInterval`. This is the **default**, and the most reliable choice in headless / virtual-display environments (e.g. `xvfb`), where some browsers throttle `requestAnimationFrame` for inactive pages and `captureStream` stops emitting frames.

```typescript
import { MediaMock, TimerMode, devices } from "@eatsjobs/media-mock";

MediaMock
  .setTimerMode(TimerMode.SetInterval) // default — robust in headless CI
  .mock(devices["iPhone 12"]);

await MediaMock.setSource("./assets/640x480-sample.png");
```

## Streaming Your Own Canvas (3D scenes)

Pass a canvas you render into and MediaMock captures it directly, so a WebGL/Three.js scene — or any animation you draw yourself — becomes the camera feed:

```typescript
import { MediaMock, devices } from "@eatsjobs/media-mock";
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer();
renderer.setSize(1280, 720);

MediaMock.mock(devices["Mac Desktop"]);
await MediaMock.setSource(renderer.domElement);

// Your render loop drives the stream
function animate() {
  requestAnimationFrame(animate);
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
}
animate();

const stream = await navigator.mediaDevices.getUserMedia({ video: true });
// every frame is your live 3D scene
```

Your canvas is captured as-is. MediaMock creates no canvas of its own, acquires **no rendering context** (a WebGL canvas has no 2D context to give), and runs no drawing loop — your render loop is the frame source.

Four guarantees for a canvas you supply:

- **It is never resized.** Assigning `width`/`height` would clear the WebGL drawing buffer and desynchronise a renderer's internal size bookkeeping. Resolution constraints are therefore *not* applied to it.
- **The track reports the canvas's real size.** `getSettings()` returns its actual pixel dimensions rather than a constraint-matched value. Request 1920×1080 from an 800×600 canvas and you get 800×600 — with a warning in debug mode, not a resize.
- **`frameRate` constraints still apply**, because capture rate is independent of your render loop.
- **Nothing else is touched** — not restyled (including by `enableDebugMode()`), not moved in the DOM, not removed by `unmock()`.

### Swapping sources while a stream is live

`setSource()` can be called at any time, but a stream already handed out by `getUserMedia()` only follows the change while the underlying canvas stays the same:

| Swap on a live stream | Follows? |
| --- | --- |
| image → image, image → video, video → image | **yes** — both are drawn onto the canvas MediaMock owns |
| image/video → your canvas | no |
| your canvas → image/video | no |
| your canvas → a *different* canvas | no |

A track from `captureStream()` is bound for life to the canvas it was captured from, and no API can re-point it — so crossing that boundary needs a fresh stream:

```typescript
await MediaMock.setSource(renderer.domElement);
const stream = await navigator.mediaDevices.getUserMedia({ video: true });
```

MediaMock logs a warning when a swap cannot reach the live stream, rather than letting its frames quietly freeze.

### Any source: `setSource`

`setSource` is the single entry point for every kind of source:

```typescript
await MediaMock.setSource("./assets/barcode.png");   // image
await MediaMock.setSource("./assets/clip.webm");     // video
await MediaMock.setSource(renderer.domElement);      // canvas
```

For anything else, implement `FrameSource` yourself — useful for procedural frames such as synthetic test patterns:

```typescript
import { MediaMock, type FrameSource } from "@eatsjobs/media-mock";

const noise: FrameSource = {
  size: { width: 640, height: 480 },
  drawInto(ctx, width, height) {
    ctx.fillStyle = `hsl(${(Date.now() / 10) % 360}, 100%, 50%)`;
    ctx.fillRect(0, 0, width, height);
  },
};

await MediaMock.setSource(noise);
```

A source provides **either** `drawInto` (MediaMock owns the canvas and drives the timer) **or** `captureCanvas` (MediaMock captures your canvas and runs no timer). Note that a `drawInto` source does not dictate resolution — MediaMock sizes its canvas from the constraints and the emulated device, as it does for an image.

## Audio

Every preset exposes a microphone alongside its cameras, so a request for audio behaves like it would on the real device:

```typescript
MediaMock.mock(devices["iPhone 12"]);

const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
stream.getVideoTracks();  // [MediaStreamTrack] — the canvas capture
stream.getAudioTracks();  // [MediaStreamTrack] — a live, silent track

const [microphone] = stream.getAudioTracks();
microphone.label;                  // "iPhone Microphone"
microphone.getSettings().deviceId; // the audioinput's deviceId
microphone.getCapabilities();      // echoCancellation, channelCount, sampleRate, ...
```

The track is produced by a Web Audio `MediaStreamAudioDestinationNode` with nothing connected to it: it is live and readable, it simply carries silence. That is enough for code that records, meters, or just checks a microphone is present; it will not produce a waveform to analyse.

`getUserMedia({ audio: true })` on its own returns an audio-only stream and builds no capture canvas. Which preset has what:

| Preset | `audioinput` | `audiooutput` |
| --- | --- | --- |
| `iPhone 12` | `iPhone Microphone` | *(none — iOS Safari exposes no outputs)* |
| `Samsung Galaxy M53` | `Default - Microphone (Built-in)` | `Default - Speaker` |
| `Mac Desktop` | `MacBook Pro Microphone (Built-in)` | `MacBook Pro Speakers (Built-in)` |

Requesting a kind the emulated device does not have fails the whole call with `NotFoundError`, exactly as `getUserMedia` does on real hardware — it is all-or-nothing, never a partial stream. The same applies in a runtime with no Web Audio: no audio track can be produced there, so the call fails rather than returning video only.

## Constraints the device cannot meet

`exact`, `min` and `max` are mandatory: a real camera refuses a request it cannot serve rather than substituting something else. The mock does the same, rejecting with an `OverconstrainedError` whose `constraint` names what failed.

```typescript
MediaMock.mock(devices["iPhone 12"]);

await navigator.mediaDevices.getUserMedia({
  video: { width: { exact: 99999 } },
});
// OverconstrainedError, constraint: "width"

await navigator.mediaDevices.getUserMedia({
  video: { deviceId: { exact: "not-a-real-camera" } },
});
// OverconstrainedError, constraint: "deviceId"
```

`ideal` and bare values stay advisory — the mock gets as close as it can and never rejects over them:

```typescript
await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 99999 } } });
// resolves, snapped to the closest resolution the device supports
```

Checked against the selected device's `getCapabilities()`: `width`, `height` (in either orientation, since a sensor held sideways produces the transpose), `frameRate`, `aspectRatio`, and for audio `channelCount`, `sampleRate`, `sampleSize`. A capability the device does not declare is not checked, and neither is a constraint the device reports as unsupported through `getSupportedConstraints()` — a UA ignores a constraint it does not implement. Requesting neither `video` nor `audio` rejects with a `TypeError`, as browsers do.

## Simulating Errors

Real apps have to handle a user denying camera permission, a machine with no camera, or a camera already in use by another application. `simulateGetUserMediaError` makes `getUserMedia` reject so those paths can be tested:

```typescript
import { MediaMock, devices } from "@eatsjobs/media-mock";

MediaMock.mock(devices["iPhone 12"]);
MediaMock.simulateGetUserMediaError("NotAllowedError");

try {
  await navigator.mediaDevices.getUserMedia({ video: true });
} catch (error) {
  console.log(error.name);    // "NotAllowedError"
  console.log(error.message); // "Permission denied"
}

// Back to normal streaming
MediaMock.clearGetUserMediaError();
```

The error stays in effect for every `getUserMedia` call until you clear it (`unmock()` clears it too). Each rejection is a fresh error instance, as in real browsers.

Supported names, with the message each one defaults to:

| Name | Default message | Typical cause |
| --- | --- | --- |
| `NotAllowedError` | `Permission denied` | User denied camera permission |
| `NotFoundError` | `Requested device not found` | No device matches the constraints |
| `NotReadableError` | `Could not start video source` | Camera busy or hardware/OS error |
| `OverconstrainedError` | *(empty)* | Constraints cannot be satisfied |
| `AbortError` | `Starting videoinput failed` | Device failed to start |
| `SecurityError` | `MediaDevices access is not allowed in this context` | Blocked (e.g. insecure context) |

Override the message, or name the offending constraint for `OverconstrainedError`:

```typescript
MediaMock.simulateGetUserMediaError("NotReadableError", {
  message: "Camera is already in use by another app",
});

MediaMock.simulateGetUserMediaError("OverconstrainedError", {
  constraint: "width",
});
```

### enumerateDevices while permission is denied

Real browsers do **not** reject `enumerateDevices()` when permission is missing — they resolve with redacted entries. While a `NotAllowedError` is simulated, the mock does the same: `kind` is preserved and `label`, `deviceId`, and `groupId` are empty strings.

```typescript
MediaMock.simulateGetUserMediaError("NotAllowedError");

await navigator.mediaDevices.enumerateDevices();
// [{ kind: "videoinput", label: "", deviceId: "", groupId: "" }, ...]

MediaMock.clearGetUserMediaError();
// labels and ids visible again
```

Other error names leave `enumerateDevices()` untouched.

## Creating Custom Mock Devices

Beyond the built-in presets (`iPhone 12`, `Samsung Galaxy M53`, `Mac Desktop`), you can build your own `MediaDeviceInfo` entries with `createMediaDeviceInfo` and add them at runtime with `addMockDevice`. This is useful for simulating specific capabilities such as `torch` or `zoom`.

```typescript
import { MediaMock, createMediaDeviceInfo, devices } from "@eatsjobs/media-mock";

MediaMock.mock(devices["iPhone 12"]);

const extraCamera = createMediaDeviceInfo({
  deviceId: "my-custom-camera",
  groupId: "my-group",
  kind: "videoinput",
  label: "Custom Telephoto Camera",
  mockCapabilities: {
    width: { min: 1, max: 4032 },
    height: { min: 1, max: 3024 },
    torch: true,
    zoom: { min: 1, max: 10 },
  },
});

MediaMock.addMockDevice(extraCamera); // fires a `devicechange` event
```

## Migrating to 2.0

Two breaking changes, both mechanical:

```diff
-await MediaMock.setMediaURL("./assets/frame.png");
+await MediaMock.setSource("./assets/frame.png");

-MediaMock.settings.canvasScaleFactor = 0.8;
+MediaMock.configure({ canvasScaleFactor: 0.8 });
```

TypeScript flags both, so a clean type-check means the upgrade is complete. Everything else is unchanged. See **[MIGRATION.md](./MIGRATION.md)** for the full guide, including why each change was made and the optional move to isolated instances via `createMediaMock()`.

---

## API Documentation

### `MediaMock`
  
The main class of the library, used to configure, initialize, and manage the mock media devices.

#### `async setSource(source: string | HTMLCanvasElement | FrameSource): Promise<MediaMock>`

Sets what the mocked camera streams, and returns the instance for chaining. See [Streaming Your Own Canvas](#streaming-your-own-canvas-3d-scenes).

- **source**: a media URL (image or video, chosen by extension), an `HTMLCanvasElement` you render into, or your own `FrameSource`.

A failed load leaves the previous source and any running stream untouched.

#### `FrameSource`

```typescript
interface FrameSource {
  /** Intrinsic size of the media, in pixels. */
  readonly size: { width: number; height: number };
  /** DOM element behind the source, if any — exposed so debug mode can show it. */
  readonly element?: HTMLElement;
  /** Load whatever is needed before capture starts; may reject. */
  prepare?(): Promise<void>;
  /** Paint one frame. Provide this OR captureCanvas. */
  drawInto?(ctx: CanvasRenderingContext2D, width: number, height: number): void;
  /** A canvas you already render into; captured as-is, with no drawing loop. */
  readonly captureCanvas?: HTMLCanvasElement;
  /** Release only what this source created. */
  dispose?(): void;
}
```

#### `enableDebugMode(): MediaMock`

Enables debug mode, appending the mock canvas and image elements to the DOM for visualization. This allows you to see what's being used as a video feed during tests.

#### `disableDebugMode(): MediaMock`

Disables debug mode, hiding the mock canvas and image again. Both stay attached to the DOM offscreen — the canvas so `captureStream()` keeps producing frames, the image so webkit doesn't evict its decoded pixel data.

#### `setCanvasScaleFactor(factor: number): MediaMock`

Sets the scale factor for the image in the canvas. Lower values create more margin, higher values fill more of the canvas.

- **factor**: `number` - Scale factor between 0.1 and 1.0.

#### `setMediaTimeout(timeoutMs: number): MediaMock`

Sets the timeout for media loading (both images and videos) in milliseconds. This allows you to adjust the timeout based on network conditions or test requirements.

- **timeoutMs**: `number` - Timeout in milliseconds. Must be a positive number. Default is 60000 (60 seconds).

#### `setTimerMode(mode: TimerMode): MediaMock`

Sets the timer strategy used for the canvas drawing loop that feeds `captureStream`. See [TimerMode](#timermode) for the available modes and when to use each. Defaults to `TimerMode.SetInterval`.

- **mode**: `TimerMode` - One of `TimerMode.Auto`, `TimerMode.Raf`, or `TimerMode.SetInterval`.

#### `simulateGetUserMediaError(name: GetUserMediaErrorName, options?): MediaMock`

Makes every subsequent `getUserMedia` call reject with the given error instead of returning a stream, until [`clearGetUserMediaError`](#cleargetusermediaerror-mediamock) or `unmock()` is called. While `"NotAllowedError"` is simulated, `enumerateDevices()` also returns redacted entries — see [Simulating Errors](#simulating-errors).

- **name**: `GetUserMediaErrorName` - The error to reject with, e.g. `"NotAllowedError"`.
- **options.message**: `string` *(optional)* - Overrides the realistic default message for that error name.
- **options.constraint**: `string` *(optional)* - `"OverconstrainedError"` only: the name of the constraint that could not be satisfied, e.g. `"width"`.

#### `clearGetUserMediaError(): MediaMock`

Stops simulating a `getUserMedia` failure, so subsequent calls return a mock stream again and `enumerateDevices()` reports full device info.

#### `configure(options: ConfigurableSettings): MediaMock`

Updates configuration; omitted options keep their current value. Returns the instance for chaining.

```typescript
MediaMock.configure({
  canvasScaleFactor: 0.8,          // clamped to a minimum of 0.1
  mediaTimeout: 30_000,            // must be positive
  timerMode: TimerMode.SetInterval,
});
```

`setCanvasScaleFactor`, `setMediaTimeout` and `setTimerMode` remain as shorthands for a single option each.

#### `settings: Readonly<Settings>`

The current configuration, as a frozen snapshot. Readable as before; assigning to it throws. The snapshot is frozen all the way down and its nested values are copies, so it is never a way into the mock's own state — use `configure()`, `addMockDevice()` and `removeMockDevice()` to make changes.

```typescript
MediaMock.settings.mediaURL;                       // "./assets/frame.png"
MediaMock.settings.canvasScaleFactor = 0.5;        // TypeError
MediaMock.settings.constraints.width = false;      // TypeError
MediaMock.settings.device.mediaDeviceInfo.push(d); // TypeError

MediaMock.configure({ canvasScaleFactor: 0.5 });   // do this instead
MediaMock.addMockDevice(d);                        // and this
```

#### `addMockDevice(device: MockMediaDeviceInfo): MediaMock`

Adds a new mock device to the current device configuration and triggers a `devicechange` event.

- **device**: `MockMediaDeviceInfo` - The mock device to add.

#### `removeMockDevice(deviceId: string): MediaMock`

Removes a mock device by its device ID and triggers a `devicechange` event.

- **deviceId**: `string` - The ID of the device to remove.

#### `setMockedVideoTracksHandler(handler: (tracks: MediaStreamTrack[]) => MediaStreamTrack[]): MediaMock`

Sets a custom handler for the video tracks. The handler is called when the video tracks are created and can be used to modify the tracks programmatically.

- **handler**: `(tracks: MediaStreamTrack[]) => MediaStreamTrack[]` - A function that receives the video tracks and returns the modified tracks.

#### `mock(device: DeviceConfig, options?: MockOptions): MediaMock`

Initializes the mock with a specific device configuration and enables specified media device methods for testing.

- **device**: `DeviceConfig` - The device configuration preset to use (e.g., `devices["iPhone 12"]`).
- **options**: `MockOptions` - An optional configuration to enable specific `navigator.mediaDevices` methods, such as `getUserMedia` and `enumerateDevices`.

#### `unmock(): MediaMock`

Restores original `navigator.mediaDevices` methods by removing the mock properties and stops any ongoing mock stream. Useful for cleanup after testing.

---

### `createMediaMock()`

Creates an independent instance. Two instances share no configuration, device list, source or simulated error, so state cannot leak between test files through the shared singleton.

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

`navigator.mediaDevices` is itself global, so only one instance should be mocking it at a time.

---

### `TimerMode`

Enum controlling which timer drives the canvas drawing loop behind `captureStream`. Set it via [`setTimerMode`](#settimermodemode-timermode-mediamock).

```typescript
enum TimerMode {
  Auto = "auto",
  Raf = "raf",
  SetInterval = "setInterval",
}
```

- **`Auto`** - Uses `setInterval` when `requestAnimationFrame` may be throttled (detected via `document.hidden`), otherwise `requestAnimationFrame`.
- **`Raf`** - Always uses `requestAnimationFrame`.
- **`SetInterval`** - Always uses `setInterval`. **Default.** Most reliable in headless / virtual-display environments (e.g. `xvfb`), where `requestAnimationFrame` may be throttled and `captureStream` stops emitting frames.

---

### `GetUserMediaErrorName`

The error names accepted by [`simulateGetUserMediaError`](#simulategetusermediaerrorname-getusermediaerrorname-options-mediamock). See [Simulating Errors](#simulating-errors) for the default message of each.

```typescript
type GetUserMediaErrorName =
  | "NotAllowedError"
  | "NotFoundError"
  | "NotReadableError"
  | "OverconstrainedError"
  | "AbortError"
  | "SecurityError";

interface SimulatedErrorOptions {
  message?: string;
  constraint?: string;
}
```

Rejections are `DOMException` instances carrying the requested `name`. `"OverconstrainedError"` uses the native `OverconstrainedError` constructor where the browser provides one (Chromium) and otherwise a `DOMException` with a `constraint` property, so `error.name` and `error.constraint` can be asserted on either.

---

### `createMediaDeviceInfo`

Factory for building a custom `MockMediaDeviceInfo`, suitable for `addMockDevice` or for assembling a custom [`DeviceConfig`](#deviceconfig).

```typescript
function createMediaDeviceInfo(options: {
  deviceId: string;
  groupId: string;
  kind: MediaDeviceKind;
  label: string;
  mockCapabilities?: EnhancedMediaTrackCapabilities;
}): MockMediaDeviceInfo;
```

- **deviceId**: `string` - Unique device identifier.
- **groupId**: `string` - Group identifier (devices sharing physical hardware share a group).
- **kind**: `MediaDeviceKind` - e.g. `"videoinput"`, `"audioinput"`, `"audiooutput"`.
- **label**: `string` - Human-readable device label.
- **mockCapabilities**: `EnhancedMediaTrackCapabilities` *(optional)* - Capabilities returned by the device's `getCapabilities()`. Defaults to `{ width: { min: 1, max: 1280 }, height: { min: 1, max: 720 } }`.

`EnhancedMediaTrackCapabilities` extends the standard `MediaTrackCapabilities` with commonly mocked extras:

```typescript
interface EnhancedMediaTrackCapabilities extends MediaTrackCapabilities {
  whiteBalanceMode?: string[];
  focusDistance?: { min: number };
  zoom?: { max: number; min: number };
  torch?: boolean;
  backgroundBlur?: boolean[];
  resizeMode?: string[];
}
```

---

### `MockOptions`

Which `navigator.mediaDevices` methods to replace, and what `getUserMedia` should produce. Every member is optional; omit the object entirely to get all of the defaults.

```typescript
interface MockOptions {
  mediaDevices?: {
    getUserMedia?: boolean;
    getSupportedConstraints?: boolean;
    enumerateDevices?: boolean;
  };
  frames?: boolean;
  audio?: boolean;
  forceReadyState?: boolean;
}
```

- **mediaDevices.getUserMedia**: `boolean` (default `true`) - Enables `navigator.mediaDevices.getUserMedia`.
- **mediaDevices.getSupportedConstraints**: `boolean` (default `true`) - Enables `navigator.mediaDevices.getSupportedConstraints`.
- **mediaDevices.enumerateDevices**: `boolean` (default `true`) - Enables `navigator.mediaDevices.enumerateDevices`.
- **frames**: `boolean` (default `true`) - Whether to paint real video frames. Needs a canvas with a 2D context and `captureStream()`, so set `false` in a DOM emulator. See [Unit testing without a browser](#unit-testing-without-a-browser).
- **audio**: `boolean` (default `true`) - Whether to produce an audio track. Needs Web Audio; with `false`, a request for audio is refused with `NotFoundError`.
- **forceReadyState**: `boolean` (default `true`) - Report `HAVE_ENOUGH_DATA` for a `<video>` playing a mocked stream that the browser has parked at `HAVE_FUTURE_DATA`, which WebKitGTK does permanently. Cannot fire on an engine that reports 4 on its own. See [What the mock does about it](#what-the-mock-does-about-it).

### `Settings`

The shape of `MediaMock.settings`, which is a **read-only** snapshot — see [`settings`](#settings-readonlysettings). Write with [`configure()`](#configureoptions-configurablesettings-mediamock).

- **mediaURL**: `string` *(read-only)* - The URL of the image or video used as the media source. Set by `setSource()`; empty of meaning when the source is a canvas or custom `FrameSource`.
- **device**: `DeviceConfig` - Specifies the configuration for the mock device, such as resolution and media information.
- **constraints**: `SupportedConstraints` - The constraint names reported by the mocked `getSupportedConstraints()`. Kept in sync with the mocked device by `mock()`.
- **canvasScaleFactor**: `number` - Scale factor for the image in the canvas, clamped to a minimum of 0.1. Configurable.
- **mediaTimeout**: `number` - Timeout for media loading in milliseconds (default: 60000 = 60 seconds). Applied to both images and videos. Must be positive. Configurable.
- **timerMode**: `TimerMode` - Timer strategy for the canvas drawing loop (default: `TimerMode.SetInterval`). See [TimerMode](#timermode). Configurable.

The three marked *configurable* are the members of `ConfigurableSettings`, the argument to `configure()`:

```typescript
interface ConfigurableSettings {
  canvasScaleFactor?: number;
  mediaTimeout?: number;
  timerMode?: TimerMode;
}
```

---

### `DeviceConfig`

Represents configuration settings for mock devices, including available video resolutions and media device information like device ID and group ID. Used in `MediaMock.mock()` to apply device-specific settings.

```typescript
interface DeviceConfig {
  videoResolutions: { width: number; height: number }[];
  mediaDeviceInfo: MockMediaDeviceInfo[];
  supportedConstraints: SupportedConstraints;
}

type SupportedConstraints = Partial<
  Record<
    | keyof MediaTrackSupportedConstraints
    | "torch"
    | "volume"
    | "whiteBalanceMode"
    | "zoom",
    boolean
  >
>;

interface MockMediaDeviceInfo extends MediaDeviceInfo {
  getCapabilities: () => EnhancedMediaTrackCapabilities;
}

```

---

## Unit testing without a browser

A DOM emulator has no rasteriser and no codecs, so it can never produce real frames. It can still answer every question about *which devices exist and what they can do* — and that is what most unit tests actually ask. Pass `frames: false` and `audio: false` to get that half:

```typescript
import { MediaMock, devices } from "@eatsjobs/media-mock";

MediaMock.mock(devices["iPhone 12"], { frames: false, audio: false });

await navigator.mediaDevices.enumerateDevices();      // the emulated device list
navigator.mediaDevices.getSupportedConstraints();     // the device's constraints

const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
const [track] = stream.getVideoTracks();
track.label;                    // "Back Camera"
track.getSettings().deviceId;   // the selected camera's id
track.getCapabilities().torch;  // true
```

`navigator.mediaDevices` does not exist in these environments, so `mock()` installs one and `unmock()` removes it again — including the `navigator` object itself on Node below v21, which has none. The stream and its tracks satisfy `instanceof MediaStream` / `instanceof MediaStreamTrack` wherever the environment defines those interfaces. The track is live and fully described but carries no pixels; put a `<video>` in front of it and nothing will paint.

**What works:** `enumerateDevices`, `getSupportedConstraints`, `getCapabilities`, device selection by `deviceId`/`facingMode`, constraint refusal (`OverconstrainedError`, `NotFoundError`, `TypeError`), error simulation, redaction while permission is denied, and `devicechange` events.

**What does not:** frames of any kind, audio tracks, and anything that loads media from a URL — an emulator has no server to fetch `./assets/frame.png` from. Use `setSource()` only in a real browser.

| | node | happy-dom | jsdom |
| --- | --- | --- | --- |
| Device emulation (`frames: false`) | yes | yes | yes |
| Real frames | no | no | no |
| Audio tracks | no | no | no |

happy-dom and jsdom are equally usable for the device half — the library's own emulator suite runs green on both. Neither can paint, and they fail differently if you try (happy-dom returns a null canvas context; jsdom's `<img>` never settles at all), so leaving `frames` at its default in either raises an error naming the option before any media is loaded, rather than hanging until the media timeout.

Adding `canvas` or a canvas mock to jsdom does not change this: node-canvas has no `captureStream`, and jsdom's `<img>` still will not load a data URI. Frames need a real browser.

## Testing with Playwright

The mock replaces methods on `MediaDevices.prototype`, so it takes effect from the moment the module runs — but only in the realm it runs in. Two consequences worth knowing:

- **Install it before the page's own scripts.** If your app calls `getUserMedia` during startup, set the mock up in `page.addInitScript()` rather than after `page.goto()`.
- **It does not reach into iframes.** Each frame is its own realm with its own `MediaDevices.prototype`. A page under test that runs your camera code inside an iframe will see the real (or missing) camera there.

### WebKitGTK never reports `readyState === 4`

A `<video>` fed a `MediaStream` stays at `HAVE_FUTURE_DATA` (3) forever under **WebKitGTK** — WebKit on Linux, which is the build Playwright ships and CI containers run. WebKit on macOS and on real machines reaches 4, as does Chromium everywhere, so this is a limitation of that one port rather than of WebKit generally.

It is not specific to this library either: a bare `canvas.captureStream()` behaves the same way there, while a plain video file in the same browser reaches 4.

**The mock corrects this for you by default** — see [`forceReadyState`](#mockoptions). The paragraphs below still describe the portable approach, which is worth following anyway for code that runs against real cameras.

Playback is healthy regardless — `currentTime` advances, frames arrive at the requested rate — so wait on an event rather than polling the property:

```typescript
const video = document.createElement("video");
video.srcObject = await navigator.mediaDevices.getUserMedia({ video: true });
await video.play();

// Portable: fires on Chromium and WebKit alike
await new Promise((resolve) => video.addEventListener("playing", resolve, { once: true }));

// Or wait for an actual frame
await new Promise((resolve) => video.requestVideoFrameCallback(resolve));
```

`canplay`, `canplaythrough`, `loadeddata` and `playing` all fire on both engines. Only `readyState === 4` is unreliable.

#### What the mock does about it

`forceReadyState` is **on by default**, so a `<video>` playing a mocked stream reports `HAVE_ENOUGH_DATA` once WebKitGTK has parked it at `HAVE_FUTURE_DATA`. Third-party code that polls `readyState === 4` — an SDK you cannot edit — therefore starts as it would on any other engine.

It is deliberately narrow, and cannot fire anywhere the browser is behaving:

- only streams this library produced are spoken for, so other media on the page is untouched;
- only `HAVE_FUTURE_DATA` is promoted. Every lower value passes through, so nothing claims readiness before the browser has the frames;
- engines that reach 4 on their own — Chromium anywhere, WebKit on macOS — never reach this code at all;
- `unmock()` restores the native property.

Turn it off to see the browser's own value, which is worth doing if readiness handling is itself what you are testing:

```typescript
MediaMock.mock(devices["iPhone 12"], { forceReadyState: false });
```

None of this makes `readyState === 4` a good thing to wait on in code that also runs against real cameras — prefer the events above there.

### Debugging

`enableDebugMode()` appends the canvas and the loaded image used by the canvas to the document.body.

```typescript

import { MediaMock, devices } from "@eatsjobs/media-mock";

// Configure and initialize MediaMock with default settings
MediaMock
  .enableDebugMode()
  .mock(devices["iPhone 12"]); // or devices["Samsung Galaxy M53"] for Android, "Mac Desktop" for desktop mediaDevice emulation

await MediaMock.setSource("./assets/640x480-sample.png");

// Set up a video element to display the stream
const videoElement = document.createElement("video");
document.body.appendChild(videoElement);

videoElement.srcObject = await navigator.mediaDevices.getUserMedia({ video: true });
videoElement.play();

```

### Similar libraries

- [https://github.com/theopenwebjp/get-user-media-mock](https://github.com/theopenwebjp/get-user-media-mock)
