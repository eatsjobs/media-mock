---
"@eatsjobs/media-mock": patch
---

Report the emulated camera's capabilities on the video track, and stop handing out mutable internal state.

`track.getCapabilities()` returned the capabilities of the capture canvas rather than of the device being emulated. Chromium and WebKit both attach a `getCapabilities()` of their own to a `captureStream()` track, and the mock only installed the device's when that method was missing — which it never was. Consumers therefore saw `facingMode: []`, no `torch`, no `zoom`, no `whiteBalanceMode`, and a `deviceId` belonging to the canvas capture that matched no entry in `enumerateDevices()` and disagreed with `getSettings().deviceId`. The emulated device's capabilities now win, with `deviceId` and `groupId` taken from the device entry so they agree with the track's settings.

Three places handed out live internal objects, so a caller who edited what they were given silently reconfigured the mock — and, since the exported device presets are module-level singletons, every other consumer of that preset too:

- `getSupportedConstraints()` returned the mock's own constraints object. It now returns a fresh copy per call, as browsers do.
- `MediaDeviceInfo.getCapabilities()` — on both `enumerateDevices()` entries and a decorated track — returned the preset's capabilities object. It now returns a fresh copy per call.
- `MediaMock.settings` was documented as a frozen snapshot but was only frozen at the top level, so `settings.constraints.width = false` or `settings.device.mediaDeviceInfo.push(...)` reached straight into the mock. The snapshot is now copied and frozen all the way down; writes at any depth throw, as the documentation always said. Use `configure()` and `addMockDevice()`/`removeMockDevice()` to make changes, as before.
