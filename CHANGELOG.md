# @eatsjobs/media-mock

## 2.0.0

### Major Changes

- 9441a39: **Breaking:** `setMediaURL()` is replaced by `setSource()`, and `settings` is now read-only.

  ```diff
  -await MediaMock.setMediaURL("./assets/frame.png");
  +await MediaMock.setSource("./assets/frame.png");

  -MediaMock.settings.canvasScaleFactor = 0.8;
  +MediaMock.configure({ canvasScaleFactor: 0.8 });
  ```

  `setSource()` accepts everything `setMediaURL` did, plus an `HTMLCanvasElement` or a custom `FrameSource`. `settings` remains readable and is now a frozen snapshot, so an accidental assignment throws instead of being silently ignored; `setCanvasScaleFactor`, `setMediaTimeout` and `setTimerMode` keep working as shorthands for `configure()`.

  Added `createMediaMock()`, which returns an independent instance. Two instances share no configuration, device list, source or simulated error, so state cannot leak between test files through the shared singleton — the cause of two bugs fixed in 1.4.0. `MediaMock` remains the default export and the documented path.

  Nothing else changes: `mock`, `unmock`, `enableDebugMode`, `addMockDevice`, `setMockedVideoTracksHandler`, `simulateGetUserMediaError`, `TimerMode` and `devices` all behave as before.

### Minor Changes

- f156a24: Stream a canvas you render into, so a WebGL/Three.js 3D scene can act as the mock camera feed.

  ```typescript
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(1280, 720);

  MediaMock.mock(devices["Mac Desktop"]);
  await MediaMock.setSource(renderer.domElement);

  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  // every frame is the live 3D scene
  ```

  The canvas is captured as-is: MediaMock creates no canvas, acquires no rendering context (a WebGL canvas has none to give), and runs no drawing loop — your render loop drives the frames. It is never resized (that would clear the WebGL drawing buffer and desynchronise a renderer's size bookkeeping), never restyled or moved in the DOM, and never removed by `unmock()`. The track reports the canvas's real pixel size; `frameRate` constraints still apply.

  New `setSource()` accepts a media URL, an `HTMLCanvasElement`, or your own `FrameSource` — now an exported type, so procedural sources such as synthetic test patterns are possible:

  ```typescript
  import { MediaMock, type FrameSource } from "@eatsjobs/media-mock";

  const pattern: FrameSource = {
    size: { width: 640, height: 480 },
    drawInto(ctx, width, height) {
      ctx.fillStyle = "#ff00ff";
      ctx.fillRect(0, 0, width, height);
    },
  };
  await MediaMock.setSource(pattern);
  ```

  `setMediaURL()` keeps working unchanged; it now delegates to `setSource()`.

### Patch Changes

- e6ad2eb: Complete the split of `MediaMockClass` into focused modules.

  - `lib/captureSurface.ts` — owns the canvas `captureStream()` runs on, and the distinction between one created here and one borrowed from a source. Borrowed canvases are never styled, moved or removed; the webkit-specific reasons for attaching an owned canvas and for reading a pixel back before capture now live next to the code that does it.
  - `lib/drawingLoop.ts` — the repaint timer, including `TimerMode` and the rAF-versus-`setInterval` decision. `TimerMode` is re-exported from the entry point, so `import { TimerMode }` is unchanged.
  - `lib/debugView.ts` — all show/hide styling for the canvas and source elements, replacing `lib/sources/elementVisibility.ts`.

  `lib/main.ts` drops from 820 to 660 lines.

  The timer logic gains unit tests it never had: mode resolution including the hidden-page and missing-rAF fallbacks, the loop's immediate first draw, interval cadence, rAF throttling, restart and teardown.

- 7ff113e: Fix `getUserMedia()` throwing a `TypeError` when the device config lists no `videoResolutions`, and extract constraint parsing and resolution matching into pure internal modules.

  A `DeviceConfig` with an empty `videoResolutions` array made `getUserMedia()` fail with `Cannot read properties of undefined (reading 'resolution')`: the best-fit search indexed into an empty scored list, and the fallback that was supposed to handle this case sat behind it as unreachable code. Such a config now resolves to 640x480 (swapped to 480x640 in portrait).

  Internal restructuring, with no public API change:

  - `lib/constraints.ts` — one unwrapping implementation for constrainable values, replacing four near-duplicate copies that each re-derived `exact`/`ideal`/`max` handling. That duplication is what allowed `frameRate: { exact: n }` to be ignored in an earlier release.
  - `lib/resolution.ts` — resolution matching as a pure function taking orientation as an argument instead of reading `window`, and never mutating the caller's resolution list.

  Both modules are DOM-free and covered by a new node-environment Vitest project (`tests/unit/**`), so 30 assertions that previously required booting a browser now run in about 100ms. Seven browser tests that reached into private methods and could only assert "defined and greater than zero" were replaced by unit tests pinning exact expected resolutions.

- 1587ed2: Extract device selection, track decoration and prototype patching out of `MediaMockClass`. Internal restructuring with no public API change.

  - `lib/deviceRegistry.ts` — `cloneDeviceConfig`, `selectVideoDevice` and `listDevices` as pure functions. Device selection previously lived partly inline in `getMockStream` and partly in a private method; it is now one function with node tests covering deviceId precedence, the "last matching camera wins" rule for `facingMode`, unsatisfiable requests, and configs with no video devices.
  - `lib/track.ts` — everything that makes a canvas-capture track look like a camera track: label, id, `getCapabilities` and the `getSettings` fill-ins.
  - `lib/patchMediaDevices.ts` — `MediaDevices.prototype` patching and restoration, including the rule that the native implementation is captured only on the first patch so repeated `mock()` calls cannot lose it.

  Every test that reached into library internals is now gone: the last one asserted an internal map was empty after `unmock()`, and instead asserts the observable contract — that `MediaDevices.prototype` holds the native methods again.

  `lib/track.ts` reaches full statement coverage in the process: its label/id/settings decoration and both capabilities fallbacks previously had only incidental coverage, and the fallback used when a device declares no capabilities of its own was never executed at all. `setTimerMode` also gains an end-to-end test across all three timer modes, having had none. Coverage rises from 88.7% to 93.1% of statements and from 75.3% to 83.0% of branches.

- f92ca58: Fix the test run hanging on a cold Vite cache.

  `three`, used only by the demo page, was being picked up by Vite's dependency optimizer during the browser test run. The resulting re-optimize forced a page reload mid-run, and Vitest wedged instead of finishing — every test had already passed. It only showed up in CI, where the Vite cache is always cold; locally the cache was warm from running the dev server.

  The test config now excludes `three` from pre-bundling, and the demo imports it lazily so it is not a static dependency of the page entry.

- e94af65: Replace the branching between image and video media with a `FrameSource` abstraction. Internal restructuring with no public API change.

  `MediaMockClass` held `currentImage` and `currentVideo` side by side and re-derived which one was live by re-parsing `settings.mediaURL`, giving 42 branches spread across `setMediaURL`, the drawing loops, debug mode and teardown. Media loading, DOM attachment, per-frame painting and cleanup now live in the source that owns them:

  - `lib/sources/ImageSource.ts` — letterboxed drawing, and the attached-to-DOM workaround that keeps webkit from evicting decoded pixels
  - `lib/sources/VideoSource.ts` — fill-the-canvas drawing of a looping video
  - `lib/sources/mediaType.ts` — `isVideoURL`, now DOM-free and unit-tested in node
  - `lib/sources/loadVideo.ts` — video element creation and first-frame wait

  The two near-identical drawing loops collapse into one that asks the source to paint. Frame rate throttling and the first-frame-plus-readback priming (a webkit fix that previously applied only to images) now apply to every source, and `lib/main.ts` drops from 1129 to 854 lines.

## 1.4.1

### Patch Changes

- 392f8d7: Fix broken TypeScript declarations for CommonJS consumers, and bundle with [tsdown](https://tsdown.dev) instead of Vite.

  `dist/main.d.cts` was a byte-copy of `dist/main.d.ts`, and both contained only `export * from './lib/main'`. Under `node16`/`nodenext` module resolution the CJS side needs `lib/main.d.cts`, which was never emitted, so `require()` consumers hit an unresolvable type import. `arethetypeswrong` now reports the package as clean on all resolution modes, and `publint` reports no issues; both run on every build.

  Published file names changed as part of the move:

  | Before                       | After              |
  | ---------------------------- | ------------------ |
  | `dist/media-mock.js`         | `dist/main.js`     |
  | `dist/media-mock.cjs`        | `dist/main.cjs`    |
  | `dist/media-mock.umd.min.js` | `dist/main.umd.js` |

  The package entry points (`main`, `module`, `types`, `exports`, `unpkg`, `jsdelivr`) all point at the new paths, so `import`, `require`, and bare CDN URLs such as `https://cdn.jsdelivr.net/npm/@eatsjobs/media-mock` are unaffected. Only code that deep-linked to a versioned `dist/media-mock.*` path needs updating.

  The published tarball no longer contains test type declarations (`dist/tests/**`) or a `dist/lib/**` declaration tree — the whole `dist` is now five files.

## 1.4.0

### Minor Changes

- 0bb275a: Add `getUserMedia` error simulation, so tests can exercise permission-denied, no-camera, and overconstrained paths:

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

### Patch Changes

- aa4111f: Bug fixes and cleanup:

  - `unmock()` now restores the native `navigator.mediaDevices` methods even when `mock()` was called multiple times without unmocking in between (previously the native implementations were permanently lost).
  - `getSupportedConstraints()` now reflects the currently mocked device instead of always returning the default iPhone 12 constraints.
  - Debug mode now actually makes the source image visible (red border, natural size); `disableDebugMode()` hides it again but keeps it in the DOM so webkit doesn't evict its decoded pixel data.
  - Video URLs with query strings or fragments (e.g. `video.mp4?token=abc`) are now correctly detected as videos.
  - `mock()` clones the device config, so `addMockDevice()`/`removeMockDevice()` no longer mutate the exported `devices` presets across tests.
  - `frameRate: { exact: n }` (and `max`) constraints are now honored when deriving the stream FPS.
  - `unmock()` resets any custom handler set via `setMockedVideoTracksHandler()`.
  - Fixed the `supportedConstraints` type: `Record<keyof MediaTrackSupportedConstraints & "torch", boolean>` resolved to `Record<never, boolean>` and type-checked nothing. It's now the exported `SupportedConstraints` type; `Settings.constraints` is typed accordingly.
  - Removed the unused internal `defineProperty` module, deduplicated the video drawing loop, and cleared the image-load timeout timer once loading settles.

## 1.3.2

### Patch Changes

- 5f9c2bb: Fill the documentation gap
- 5b91c60: Set `crossOrigin = "anonymous"` on images loaded via `setMediaURL`. Cross-origin sources (e.g. a CDN) previously tainted the capture canvas, causing `captureStream()`/`drawImage` to throw a `SecurityError`. This mirrors the existing behavior of the video source path.

## 1.3.1

### Patch Changes

- 4e7e79d: Improve monkey paching

## 1.3.0

### Minor Changes

- 2761133: Add TimerMode setting

### Patch Changes

- f177c71: Support explicit deviceId constraints and expose real-device fields

## 1.2.2

### Patch Changes

- a62c662: Add cdn section to README.md

## 1.2.1

### Patch Changes

- Add `jsdelivr` CDN field to package.json for jsdelivr.com support
- Add export for package.json

## 1.2.0

### Minor Changes

- 76447bf: The media track labels and id have now the devices ones

## 1.1.2

### Patch Changes

- 24e1af6: Fix image not painted after setMediaURL if using raf

## 1.1.1

### Patch Changes

- 88e910d: Fix tests

## 1.1.0

### Minor Changes

- f0cf162: ## Major Improvements

  ### Media Loading & Stability

  - ✅ setMediaURL waits for media to be fully loaded
  - ✅ Configurable media load timeout (default 60 seconds) via `setMediaTimeout(ms)`
  - ✅ Image loading timeout protection (prevents indefinite hangs)
  - ✅ Input validation for mediaURL with clear error messages

  ### Canvas & Drawing Optimization

  - ✅ RequestAnimationFrame (RAF) optimization with FPS throttling
  - ✅ Intelligent fallback to setInterval for older browsers
  - ✅ Proper RAF/interval cleanup in stopDrawingLoop()
  - ✅ Canvas scale factor clamping (min 0.1)

  ### Resource Management & Cleanup

  - ✅ Complete event listener cleanup in playVideo()
  - ✅ Proper state management with isPromiseSettled flag
  - ✅ Canvas context error handling and validation
  - ✅ Complete resource cleanup: streams, intervals, RAF, DOM elements, and lastDrawTime reset
  - ✅ Prevention of memory leaks through comprehensive stopMockStream()

  ### Error Handling Improvements

  - ✅ Canvas context null checks (no more silent failures)
  - ✅ Dimension validation to prevent divide-by-zero errors
  - ✅ Improved error suppression in video autoplay (console.warn instead of error)
  - ✅ Clear error messages for all input validation

  ### Code Quality & Maintenance

  - ✅ Method rename: startIntervalDrawing → startDrawingLoop (better consistency)
  - ✅ Comprehensive test coverage expansion (38 → 98 tests, +157%)
  - ✅ Branch coverage improved from 54.49% to 64.04% (+9.55%)
  - ✅ Well-organized test suite with 16 test categories
  - ✅ Production-ready code quality (7.5/10 overall score)

  ### Performance

  - ✅ Efficient FPS throttling using performance.now()
  - ✅ Aspect ratio calculation for image centering
  - ✅ Smart resolution matching algorithm
  - ✅ Fast test execution: 98 tests complete in 1.09 seconds

  ## Testing & Coverage

  New comprehensive tests covering:

  - Resolution matching algorithms (exact, best-fit, fallback)
  - Input validation and error scenarios
  - Device management and enumeration
  - Constraint application (min/max, exact, aspect ratio, frameRate)
  - Stream lifecycle (multiple streams, track stopping)
  - Device capabilities and settings
  - Cleanup and unmock operations
  - Debug mode toggling
  - Rapid mock/unmock cycles
  - Edge cases and unusual constraint combinations

  **Coverage Metrics**:

  - Statements: 65.51% → 71.35% (+5.84%)
  - Branches: 54.49% → 64.04% (+9.55%)
  - Functions: 66.66% → 72.46% (+5.80%)
  - Lines: 67.58% → 73.35% (+5.77%)

  ## Documentation

  - Updated README with setMediaTimeout() examples
  - Created comprehensive CODE_REVIEW.md (808 lines)
  - Created TEST_COVERAGE_REPORT.md with detailed metrics
  - Added inline comments for complex algorithms

  ## Breaking Changes

  None - All changes are backward compatible and additive.

  ## Migration Guide

  No migration needed. New features are optional:

  - Use `setMediaTimeout(ms)` for custom timeouts
  - Use `startDrawingLoop()` instead of internal `startIntervalDrawing()` (for tests)
  - Enjoy improved resource cleanup and error handling automatically

## 1.0.2

### Patch Changes

- 603f515: don't use an url as default media url. this open the usage for jsdom test environments. upgrade linter, sync claude.md

## 1.0.1

### Patch Changes

- 96a36c2: Update documentation for v1

## 1.0.0

### Major Changes

- # 1.0.0 Release Candidate

  This major release includes several breaking changes and significant improvements:

  ## 🚨 Breaking Changes

  - **Async setMediaURL**: `setMediaURL()` is now async and returns `Promise<MediaMockClass>` instead of `MediaMockClass`. This removes method chaining capability but enables proper async media loading.

  ## ✨ New Features

  - **Enhanced Cross-browser Testing**: Added comprehensive testing across Chromium, Firefox, and WebKit with proper permission handling
  - **Device-specific Capabilities**: MediaStreamTrack capabilities now use device-specific `mockCapabilities` from `createMediaDeviceInfo`
  - **WebKit Compatibility**: Enhanced `defineProperty` utility with error handling for WebKit's stricter security policies

  ## 🏗️ Build & Infrastructure

  - **Selective Minification**: Only UMD bundles are minified, keeping ES and CJS versions readable for debugging
  - **Clean Distribution**: Removed unnecessary test assets from build output (~1MB reduction)
  - **Node.js 22 Support**: Updated `tsconfig.node.json` for Node.js 22 compatibility with ES2023 target
  - **TypeScript Improvements**: Enhanced type safety and fixed all TypeScript errors in build configuration

  ## 🧪 Testing Improvements

  - **Multi-browser Support**: Tests now run on Chromium, Firefox, and WebKit with consistent behavior
  - **Realistic Device Emulation**: Tests use browser-specific device combinations (iOS Safari + iPhone 12, Android browsers + Samsung Galaxy M53)
  - **Enhanced Cleanup**: Added proper test cleanup to prevent hanging processes

  ## 📦 Package Improvements

  - **Proper Exports**: Updated package.json exports for maximum compatibility across module systems
  - **Optimized Bundle**: Clean build output with correct file references and no unnecessary assets

  All tests pass across all supported browsers. This release represents a major stability and compatibility milestone for the library.

## 0.8.1

### Patch Changes

- 0.8.1

## 0.8.0

### Minor Changes

- ba8a599: getResolution now takes into account the device orientation

## 0.7.0

### Minor Changes

- 1da1457: Allow scale factor more than 1

## 0.6.0

### Minor Changes

- 9c195e0: Take into account devicePixelRatio before rendering the image into canvas

## 0.5.3

### Patch Changes

- d1a642d: support change image in the stream on the fly

## 0.5.2

### Patch Changes

- c989722: add torch as default capabilities for back cameras on mobile

## 0.5.1

### Patch Changes

- 81ff175: export EnhancedMediaTrackCapabilities type

## 0.5.0

### Minor Changes

- ca76971: add setCanvasScaleFactor and canvasScaleFactor option

## 0.4.1

### Patch Changes

- 86e5475: fix alpha channel for canvas
- 86e5475: fix image not correctly scaled

## 0.4.0

### Minor Changes

- 0b5284a: Fix library types

## 0.3.0

### Minor Changes

- 96fe4ce: add possibility to mock/modify video tracks

### Patch Changes

- f042d3b: Fix unused variables

## 0.2.0

### Minor Changes

- d3ee647: setImageURL renamed to setMediaURL and accepts video urls

### Patch Changes

- 771a9c8: Upgrade dependencies

## 0.1.10

### Patch Changes

- 44aea53: Updated documentation

## 0.1.9

### Patch Changes

- d431b77: Improve package.json informations

## 0.1.8

### Patch Changes

- e1da43d: Another patch

## 0.1.7

### Patch Changes

- 3d96000: another patch test
