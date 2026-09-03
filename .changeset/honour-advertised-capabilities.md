---
"@eatsjobs/media-mock": patch
---

Accept the constraints the emulated camera advertises it supports.

Since 2.1.0 a track reports the emulated device's capabilities, so an iPhone 12 back camera correctly advertises `torch: true`. But `applyConstraints()` still went to the canvas track underneath, which knows nothing of torch — so asking for what the mock had just advertised was refused with `OverconstrainedError: Unsupported constraint`.

That combination is not device behaviour: a camera that advertises `torch: true` accepts a torch constraint. Consumers upgrading from 2.0.x saw it as a new failure, because v1 and 2.0.x only filled in `getCapabilities()` when the track lacked one — which a Chromium canvas-capture track never does — so the emulated capabilities were never visible and nothing ever asked for torch.

Constraints naming something the device advertises are now settled by the mock and reported in `getSettings()`, as a camera would:

```typescript
const [track] = stream.getVideoTracks();
track.getCapabilities().torch;                              // true
await track.applyConstraints({ advanced: [{ torch: true }] });
track.getSettings().torch;                                  // true
```

Ranges and lists are honoured the same way, so `zoom` within the advertised range and a `whiteBalanceMode` the device lists are accepted too. `advanced` stays best effort as the specification requires — an entry the device cannot meet is skipped rather than failing the call — while a mandatory constraint it cannot meet is refused with `OverconstrainedError` naming it. Anything the device does not advertise is still the browser's to answer.
