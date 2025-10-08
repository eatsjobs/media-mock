# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `@eatsjobs/media-mock`, a JavaScript library that simulates media devices (webcams, microphones) in web applications for testing purposes. It's particularly useful for automated testing with tools like Playwright and Vitest where actual hardware devices aren't available.

## Core Architecture

### Library Structure

- **Main entry**: `lib/main.ts` - Contains the `MediaMockClass` and main API
- **Device configs**: `lib/devices.ts` - Predefined device configurations (iPhone 12, Samsung Galaxy M53, Mac Desktop)
- **Media device info**: `lib/createMediaDeviceInfo.ts` - Creates mock `MediaDeviceInfo` objects
- **Image loading**: `lib/loadImage.ts` - Handles loading image assets for video simulation
- **Property definition**: `lib/defineProperty.ts` - Utility for mocking browser APIs

### Key Concepts

1. **Canvas-based streaming**: Uses HTML5 Canvas to simulate video streams from static images or video files
2. **Device orientation handling**: Automatically adjusts resolution based on device orientation (portrait/landscape)
3. **Browser API mocking**: Replaces `navigator.mediaDevices` methods with mock implementations
4. **Video track customization**: Supports custom handlers for video tracks via `setMockedVideoTracksHandler`

### API Design Pattern

The library uses a fluent/chaining API:

```typescript
MediaMock
  .enableDebugMode()
  .mock(devices["iPhone 12"]);

await MediaMock.setMediaURL("./assets/image.png")
```

## Development Commands

```bash
# Development server with live reload
npm run dev

# Build the library (TypeScript compilation + Vite bundling)
npm run build

# Run tests (Vitest with Playwright browser testing)
npm test

# Run tests with coverage
npm run test-coverage

# Type checking for package compatibility
npm run check-types
```

## Testing Architecture

- **Framework**: Vitest with `@vitest/browser` using Playwright
- **Browser**: Chromium (headless by default)
- **Test file**: `tests/main.test.ts`
- **Coverage**: Uses V8 coverage provider with multiple reporters (text, lcov, json)

The tests run in an actual browser environment, making them ideal for testing browser APIs like `navigator.mediaDevices`.

## Build Configuration

- **Bundler**: Vite with multiple output formats (ES modules, CommonJS, UMD)
- **TypeScript**: Generates both `.d.ts` and `.d.cts` declaration files
- **Library name**: "MediaMock" for UMD builds
- **Entry point**: `lib/main.ts`

## Key Implementation Details

### Video Stream Generation

The library creates video streams by:

1. Drawing images/videos onto a Canvas at specified FPS (default 30fps)
2. Using `canvas.captureStream()` to create a `MediaStream`
3. Handling both static images and video files as sources

### Device Orientation Handling

The `getResolution()` method in `lib/main.ts:463` handles device orientation by:

- Detecting portrait mode (`window.innerHeight > window.innerWidth`)
- Automatically swapping width/height for portrait orientations
- Matching requested constraints to available device resolutions

### Memory Management

The library properly cleans up resources:

- Clears intervals for canvas drawing
- Stops video tracks
- Removes DOM elements when unmocking
