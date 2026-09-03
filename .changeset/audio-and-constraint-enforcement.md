---
"@eatsjobs/media-mock": minor
---

Emulate microphones, and refuse constraints the emulated device cannot meet.

**Audio.** Every preset now exposes an `audioinput` — and, where the real device has one, an `audiooutput` — so they appear in `enumerateDevices()` alongside the cameras. `getUserMedia({ audio: true })` returns a live, silent audio track (a Web Audio `MediaStreamAudioDestinationNode` with nothing connected) carrying the emulated microphone's label, `deviceId`, `groupId` and capabilities. `{ video: true, audio: true }` returns one track of each; an audio-only request builds no capture canvas. Previously `audio` was ignored entirely: an audio-only request handed back a *video* track, and `enumerateDevices()` listed no microphone at all.

**Mandatory constraints are now enforced.** `exact`, `min` and `max` are mandatory in `getUserMedia`, and a real camera refuses a request it cannot serve. The mock now does the same, rejecting with an `OverconstrainedError` whose `constraint` names the failure, checked against the selected device's `getCapabilities()`: `width` and `height` (in either orientation, since a sensor held sideways produces the transpose), `frameRate`, `aspectRatio`, plus `channelCount`, `sampleRate` and `sampleSize` for audio. `ideal` and bare values remain advisory and never reject.

**Requests are also refused when they name nothing, or name a device that is absent.** `getUserMedia({})` and `getUserMedia({ video: false })` reject with a `TypeError`, as browsers do. A request for a kind the emulated device does not have fails the whole call with `NotFoundError` — `getUserMedia` is all-or-nothing.

Three behaviour changes to be aware of when upgrading:

- `getUserMedia({})` / `{ video: false }` used to resolve with a video stream and now throw a `TypeError`.
- `deviceId: { exact: "…" }` naming a camera that does not exist used to fall back to `facingMode`; it now rejects. An `ideal` deviceId still falls back.
- A `width`/`height`/`frameRate` `exact` value outside the device's declared capabilities used to be snapped to the nearest supported resolution; it now rejects.

All three were the mock succeeding where real hardware fails, so the tests they let pass were not exercising the caller's failure path.

Also fixed: `addMockDevice()` and `removeMockDevice()` threw in an environment with no `MediaDevices` (node), where `mock()` already warned and carried on. And the patched `getUserMedia`, `enumerateDevices` and `getSupportedConstraints` now carry the native method's `name` and arity, which feature detection and argument-forwarding wrappers read.
