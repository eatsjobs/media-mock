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
  - [Creating Custom Mock Devices](#creating-custom-mock-devices)
- [API Documentation](#api-documentation)
  - [MediaMock](#mediamock)
  - [TimerMode](#timermode)
  - [createMediaDeviceInfo](#createmediadeviceinfo)
  - [Settings](#settings)
  - [MockOptions](#mockoptions)
  - [DeviceConfig](#deviceconfig)
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
<script src="https://cdn.jsdelivr.net/npm/@eatsjobs/media-mock@1.3.1"></script>
```

**unpkg**:

```html
<!-- Latest version -->
<script src="https://unpkg.com/@eatsjobs/media-mock"></script>

<!-- Specific version -->
<script src="https://unpkg.com/@eatsjobs/media-mock@1.3.1"></script>
```

When loaded via CDN, `MediaMock` and `devices` are available on the global `window.MediaMock` object:

```html
<script src="https://cdn.jsdelivr.net/npm/@eatsjobs/media-mock"></script>
<script>
  const { MediaMock, devices } = window.MediaMock;

  MediaMock.mock(devices["iPhone 12"]);
  await MediaMock.setMediaURL("./assets/640x480-sample.png");
</script>
```

## Usage

Basic Usage

To start using MediaMock, initialize the library, configure a mock media stream, and then request a stream from navigator.mediaDevices.

```typescript
import { MediaMock, devices } from "@eatsjobs/media-mock";

// Configure and initialize MediaMock with default settings
MediaMock.mock(devices["iPhone 12"]); // or devices["Samsung Galaxy M53"] for Android, "Mac Desktop" for desktop mediaDevice emulation
await MediaMock.setMediaURL("./assets/640x480-sample.png");

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
await MediaMock.setMediaURL("./assets/640x480-sample.png");
```

## Configuring Media Load Timeout

You can adjust the timeout for media loading based on your network conditions or test requirements. The default timeout is 60 seconds for both images and videos.

```typescript
import { MediaMock, devices } from "@eatsjobs/media-mock";

MediaMock.mock(devices["iPhone 12"]);

// Set a custom timeout of 30 seconds (useful for faster tests)
MediaMock.setMediaTimeout(30 * 1000);
await MediaMock.setMediaURL("./assets/640x480-sample.png");

// Or set a longer timeout for slow networks
MediaMock.setMediaTimeout(5 * 60 * 1000); // 5 minutes
await MediaMock.setMediaURL("./assets/video.mp4");

// Method chaining is supported
MediaMock
  .setMediaTimeout(45 * 1000)
  .setCanvasScaleFactor(0.8);
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

await MediaMock.setMediaURL("./assets/640x480-sample.png");
```

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

## API Documentation

### `MediaMock`
  
The main class of the library, used to configure, initialize, and manage the mock media devices.

#### `async setMediaURL(path: string): Promise<MediaMock>`

Sets a custom image URL or video URL to be used as the source and returns the instance for chaining. This method is now asynchronous to properly handle media loading.

- **path**: `string` - Path to the image or video file.

#### `enableDebugMode(): MediaMock`

Enables debug mode, appending the mock canvas and image elements to the DOM for visualization. This allows you to see what's being used as a video feed during tests.

#### `disableDebugMode(): MediaMock`

Disables debug mode and removes the mock canvas and image elements from the DOM.

#### `setCanvasScaleFactor(factor: number): MediaMock`

Sets the scale factor for the image in the canvas. Lower values create more margin, higher values fill more of the canvas.

- **factor**: `number` - Scale factor between 0.1 and 1.0.

#### `setMediaTimeout(timeoutMs: number): MediaMock`

Sets the timeout for media loading (both images and videos) in milliseconds. This allows you to adjust the timeout based on network conditions or test requirements.

- **timeoutMs**: `number` - Timeout in milliseconds. Must be a positive number. Default is 60000 (60 seconds).

#### `setTimerMode(mode: TimerMode): MediaMock`

Sets the timer strategy used for the canvas drawing loop that feeds `captureStream`. See [TimerMode](#timermode) for the available modes and when to use each. Defaults to `TimerMode.SetInterval`.

- **mode**: `TimerMode` - One of `TimerMode.Auto`, `TimerMode.Raf`, or `TimerMode.SetInterval`.

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

Defines which `navigator.mediaDevices` methods should be mocked:

```typescript
interface MockOptions {
  mediaDevices: {
    getUserMedia: boolean;
    getSupportedConstraints: boolean;
    enumerateDevices: boolean;
  };
}
```

- **mediaDevices.getUserMedia**: `boolean` - Enables `navigator.mediaDevices.getUserMedia`.
- **mediaDevices.getSupportedConstraints**: `boolean` - Enables `navigator.mediaDevices.getSupportedConstraints`.
- **mediaDevices.enumerateDevices**: `boolean` - Enables `navigator.mediaDevices.enumerateDevices`.

### `Settings`

Interface that contains the mock settings for media URL, device configuration, and video constraints.

- **mediaURL**: `string` - The URL of the image or video used as the media source.
- **device**: `DeviceConfig` - Specifies the configuration for the mock device, such as resolution and media information.
- **constraints**: `MediaTrackConstraints` - Specifies video constraints, like resolution and frame rate.
- **canvasScaleFactor**: `number` - Scale factor for the image in the canvas (0.1-1.0).
- **mediaTimeout**: `number` - Timeout for media loading in milliseconds (default: 60000 = 60 seconds). Applied to both images and videos.
- **timerMode**: `TimerMode` - Timer strategy for the canvas drawing loop (default: `TimerMode.SetInterval`). See [TimerMode](#timermode).

---

### `DeviceConfig`

Represents configuration settings for mock devices, including available video resolutions and media device information like device ID and group ID. Used in `MediaMock.mock()` to apply device-specific settings.

```typescript
interface DeviceConfig {
  videoResolutions: { width: number; height: number }[];
  mediaDeviceInfo: MockMediaDeviceInfo[];
  supportedConstraints: Record<
    keyof MediaTrackSupportedConstraints & "torch",
    boolean
  >;
}

interface MockMediaDeviceInfo extends MediaDeviceInfo {
  getCapabilities: () => EnhancedMediaTrackCapabilities;
}

```

---

### Debugging

`enableDebugMode()` appends the canvas and the loaded image used by the canvas to the document.body.

```typescript

import { MediaMock, devices } from "@eatsjobs/media-mock";

// Configure and initialize MediaMock with default settings
MediaMock
  .enableDebugMode()
  .mock(devices["iPhone 12"]); // or devices["Samsung Galaxy M53"] for Android, "Mac Desktop" for desktop mediaDevice emulation

await MediaMock.setMediaURL("./assets/640x480-sample.png");

// Set up a video element to display the stream
const videoElement = document.createElement("video");
document.body.appendChild(videoElement);

videoElement.srcObject = await navigator.mediaDevices.getUserMedia({ video: true });
videoElement.play();

```

### Similar libraries

- [https://github.com/theopenwebjp/get-user-media-mock](https://github.com/theopenwebjp/get-user-media-mock)
