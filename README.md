# @eatsjobs/media-mock

![npm version](https://img.shields.io/npm/v/@eatsjobs/media-mock)
![build](https://img.shields.io/github/actions/workflow/status/eatsjobs/media-mock/ci.yml?branch=main)
![coverage](https://img.shields.io/codecov/c/github/eatsjobs/media-mock?flag=codecov)
![license](https://img.shields.io/github/license/eatsjobs/media-mock)
![issues](https://img.shields.io/github/issues/eatsjobs/media-mock)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/types-TypeScript-blue)
![Node Version](https://img.shields.io/node/v/@eatsjobs/media-mock)

**MediaMock** is a JavaScript library that simulates media devices (like webcams) in web applications, allowing developers to test and debug media constraints, device configurations, and stream functionality without needing physical devices. This is particularly useful in scenarios where hardware or user permissions aren't available or desired, such as in automated testing environments.

## Key Features

- **Device Simulation**: Simulate configurations for various devices like iPhone, desktop, or custom configurations.
- **Constraint Support**: Set custom video constraints such as resolution, frame rate, and more.
- **Canvas-based Mock Stream**: Use an image as a video input source and capture it as a mock stream.
- **Debug Mode**: Visualize the mock stream by displaying the canvas and image in the DOM.
- **Easy Integration with Testing**: Ideal for testing media applications with tools like Vitest, Jest or Playwright.

---

## Installation

Install with npm:

```bash
npm install @eatsjobs/media-mock
```

## Getting Started

Basic Usage

To start using MediaMock, initialize the library, configure a mock media stream, and then request a stream from navigator.mediaDevices.

```typescript
import { MediaMock, devices } from "@eatsjobs/media-mock";

// Configure and initialize MediaMock with default settings
MediaMock.setImageURL("./assets/640x480-sample.png").mock(devices["iPhone 12"]);

// Set up a video element to display the stream
const videoElement = document.createElement("video");
document.body.appendChild(videoElement);

videoElement.srcObject = await navigator.mediaDevices.getUserMedia({ video: true });
videoElement.play();
```

## Enabling Debug Mode

Debug mode appends the canvas and loaded image to the DOM, allowing you to see the mock video feed.

## Configuring a Custom Device and Constraints

You can set a specific device and define video constraints such as resolution and frame rate.

```typescript
MediaMock
  .setImageURL("./assets/full-hd-sample.png")
  .mock(devices["Mac Desktop"], {
    mediaDevices: {
      getUserMedia: true,
      enumerateDevices: true,
      getSupportedConstraints: true,
    },
  })
```


## API Documentation

### `MediaMockClass`

The main class of the library, used to configure, initialize, and manage the mock media devices.

#### `setImageURL(path: string): MediaMock`

Sets a custom image URL to use as the video source and returns the instance for chaining.

- **path**: `string` - Path to the image.

#### `enableDebugMode(): void`

Enables debug mode, appending the mock canvas and image elements to the DOM for visualization. This allows you to see what’s being used as a video feed during tests.

#### `mock(device: DeviceConfig, options?: MockOptions): MediaMock`

Initializes the mock with a specific device configuration and enables specified media device methods for testing.

- **device**: `DeviceConfig` - The device configuration preset to use (e.g., `devices["iPhone 12"]`).
- **options**: `MockOptions` - An optional configuration to enable specific `navigator.mediaDevices` methods, such as `getUserMedia` and `enumerateDevices`.

#### `unmock(): MediaMock`

Restores original `navigator.mediaDevices` methods by removing the mock properties and stops any ongoing mock stream. Useful for cleanup after testing.

---

### `MockOptions`

Defines which `navigator.mediaDevices` methods should be mocked:

- **getUserMedia**: `boolean` - Enables `navigator.mediaDevices.getUserMedia`.
- **getSupportedConstraints**: `boolean` - Enables `navigator.mediaDevices.getSupportedConstraints`.
- **enumerateDevices**: `boolean` - Enables `navigator.mediaDevices.enumerateDevices`.

### `Settings`

Interface that contains the mock settings for image URL, device configuration, and video constraints.

- **imageURL**: `string` - The URL of the image used as the video source.
- **device**: `DeviceConfig` - Specifies the configuration for the mock device, such as resolution and media information.
- **constraints**: `{ video: MediaTrackConstraints }` - Specifies video constraints, like resolution and frame rate, for testing against browser media APIs.

---

### `DeviceConfig`

Represents configuration settings for mock devices, including available video resolutions and media device information like device ID and group ID. Used in `MediaMock.mock()` to apply device-specific settings.

```typescript
interface DeviceConfig {
  videoResolutions: { width: number; height: number }[];
  mediaDeviceInfo: MockMediaDeviceInfo[];
}

interface MockMediaDeviceInfo extends MediaDeviceInfo {
  getCapabilities: () => MediaTrackCapabilities;
}

```

---
