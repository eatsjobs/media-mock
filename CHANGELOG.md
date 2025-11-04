# @eatsjobs/media-mock

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
