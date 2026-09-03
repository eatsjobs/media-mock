---
"@eatsjobs/media-mock": minor
---

Run in a DOM emulator — node, happy-dom or jsdom — for unit tests that need a camera but not pixels. The library's emulator suite runs green on all three.

`mock()` previously required a real `MediaDevices`; without one it warned and did nothing, so every later call failed with `Cannot read properties of undefined`. It now supplies its own `navigator.mediaDevices` where the environment has none, and `unmock()` takes it away again. That alone makes the whole device layer usable outside a browser: enumeration, capabilities, device selection by `deviceId`/`facingMode`, constraint refusal, error simulation, redaction while permission is denied, and `devicechange` events.

Frames and audio still need a real browser, so both are now opt-out:

```typescript
MediaMock.mock(devices["iPhone 12"], { frames: false, audio: false });
```

With `frames: false` the returned video track carries the emulated camera's label, ids, settings and capabilities but no pixels, and no canvas is built. With `audio: false` a request for audio is refused with `NotFoundError` rather than quietly returning a stream without it. Both default to `true`, and leaving `frames` on in an environment that cannot paint now raises an error naming the option instead of failing deeper in the canvas.

`MockOptions.mediaDevices` and its members are now optional, so `mock(device, { frames: false })` no longer has to restate the defaults.

Whether the environment can paint at all is now checked before any media is loaded. jsdom's `<img>` never fires `load` or `error` for a data URI, so a frames request there used to hang for the full media timeout before failing somewhere less obvious; it now fails immediately, naming `frames: false`.

Three fixes fall out of this, and apply in real browsers too:

- `stopMockStream` called `MediaStream.getTracks()`, which happy-dom does not implement — the cause of issue #11. It now falls back to the per-kind accessors.
- `loadImage` called `image.decode()` unconditionally; jsdom does not implement it at all, so the call threw rather than being skipped.
- `createGetUserMediaError` trusted any global named `OverconstrainedError`. happy-dom exposes one that builds something `Event`-shaped with neither `name` nor `constraint`, so the constructed error is now checked and the `DOMException` fallback used when it does not answer correctly.
