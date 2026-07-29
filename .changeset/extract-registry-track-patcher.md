---
"@eatsjobs/media-mock": patch
---

Extract device selection, track decoration and prototype patching out of `MediaMockClass`. Internal restructuring with no public API change.

- `lib/deviceRegistry.ts` — `cloneDeviceConfig`, `selectVideoDevice` and `listDevices` as pure functions. Device selection previously lived partly inline in `getMockStream` and partly in a private method; it is now one function with node tests covering deviceId precedence, the "last matching camera wins" rule for `facingMode`, unsatisfiable requests, and configs with no video devices.
- `lib/track.ts` — everything that makes a canvas-capture track look like a camera track: label, id, `getCapabilities` and the `getSettings` fill-ins.
- `lib/patchMediaDevices.ts` — `MediaDevices.prototype` patching and restoration, including the rule that the native implementation is captured only on the first patch so repeated `mock()` calls cannot lose it.

Every test that reached into library internals is now gone: the last one asserted an internal map was empty after `unmock()`, and instead asserts the observable contract — that `MediaDevices.prototype` holds the native methods again.

`lib/track.ts` reaches full statement coverage in the process: its label/id/settings decoration and both capabilities fallbacks previously had only incidental coverage, and the fallback used when a device declares no capabilities of its own was never executed at all. `setTimerMode` also gains an end-to-end test across all three timer modes, having had none. Coverage rises from 88.7% to 93.1% of statements and from 75.3% to 83.0% of branches.
