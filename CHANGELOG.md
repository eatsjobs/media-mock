# @eatsjobs/media-mock

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
