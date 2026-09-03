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

### Key Concepts

1. **Frame sources**: A `FrameSource` either paints into a canvas MediaMock owns (`lib/sources/ImageSource.ts`, `VideoSource.ts`) or exposes a canvas it renders itself, which is captured directly (`CanvasSource.ts`). The second kind is how a consumer's WebGL/Three.js scene becomes the feed; such a canvas is never resized, restyled, moved or removed.
2. **Device orientation handling**: Automatically adjusts resolution based on device orientation (portrait/landscape)
3. **Browser API mocking**: Replaces `navigator.mediaDevices` methods with mock implementations
4. **Video track customization**: Supports custom handlers for video tracks via `setMockedVideoTracksHandler`

### API Design Pattern

The library uses a fluent/chaining API. `settings` is a read-only snapshot; configuration is written through `configure()` (or the single-option setters, which delegate to it):

```typescript
MediaMock
  .enableDebugMode()
  .configure({ timerMode: TimerMode.SetInterval })
  .mock(devices["iPhone 12"]);

await MediaMock.setSource("./assets/image.png");   // URL, canvas, or FrameSource
```

`createMediaMock()` returns an independent instance for tests that need isolation from the shared singleton.

Breaking changes since 1.x are documented in `MIGRATION.md`, which must be updated alongside any further public API change.

## Development Commands

This project uses **pnpm** as its package manager (pinned via the `packageManager` field; enable with `corepack enable`).

```bash
# Install dependencies
pnpm install

# Development server with live reload — serves the demo in index.html + src/main.ts
pnpm dev

# Build the library (TypeScript compilation + Vite bundling)
pnpm build

# Run tests (Vitest with Playwright browser testing)
pnpm test

# Run tests with coverage
pnpm test-coverage

# Type checking for package compatibility
pnpm check-types
```

## Demo App

`pnpm dev` serves `index.html` with `src/main.ts`, which exercises the library end to end and doubles as manual verification:

- **Video file** — a video drawn onto a canvas MediaMock owns
- **Three.js scene** — a rotating cube whose `WebGLRenderer` canvas is captured directly, demonstrating `setSource(canvas)`
- **Simulate denied** — `simulateGetUserMediaError("NotAllowedError")`, showing the rejection and redacted `enumerateDevices`

`three` is a devDependency used only here; it never reaches the published bundle.

## Testing Architecture

- **Framework**: Vitest, split into four projects in `vitest.config.ts` (test-only config; the library build lives in `tsdown.config.ts`)
- **`unit` project**: node environment, `tests/unit/**`. For pure modules with no DOM dependency (`lib/constraints.ts`, `lib/resolution.ts`). Runs in ~100ms.
- **`emulator-happy-dom` / `emulator-jsdom` projects**: `tests/emulator/**`, run under both DOM emulators. For the device-emulation half — enumeration, capabilities, constraint refusal, error simulation — which needs no canvas and no codecs. These environments cannot paint frames, so tests here mock with `{ frames: false, audio: false }`. Run both: they fail in different places.
- **`browser` project**: Playwright, `tests/*.test.ts`. Chromium in CI; Chromium + WebKit locally. For anything touching `navigator.mediaDevices`, canvas or the DOM.
- **Coverage**: Uses Istanbul coverage provider with multiple reporters (text, lcov, json)

Run one project with `pnpm vitest --run --project unit` (or `--project browser`, `--project emulator-jsdom`, ...).

Put logic in a pure module with node tests when it doesn't need a browser — orientation, sizes and constraints should be passed in as arguments rather than read from `window` inside the algorithm.

## Build Configuration

- **Bundler**: [tsdown](https://tsdown.dev) (Rolldown-based), configured in `tsdown.config.ts`
- **Output formats**: ES modules, CommonJS, UMD — `dist/main.js`, `dist/main.cjs`, `dist/main.umd.js`
- **TypeScript**: tsdown emits self-contained `main.d.ts` and `main.d.cts`, so CJS and ESM consumers each resolve declarations matching their module format
- **Validation**: every build runs `attw` and `publint` over the package (`attw` also available standalone via `pnpm check-types`, which requires `dist` to exist)
- **Library name**: "MediaMock" (`globalName`) for the UMD build
- **Entry point**: `lib/main.ts`

Vite is no longer used for bundling. It still powers `pnpm dev` (on its defaults — there is no `vite.config.ts`) and Vitest, which is configured in `vitest.config.ts`.

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
