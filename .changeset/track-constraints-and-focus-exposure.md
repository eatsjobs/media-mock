---
"@eatsjobs/media-mock": minor
---

`track.getConstraints()` now returns the constraints of the last successful `applyConstraints()` call instead of `{}`. The iPhone 12 and Galaxy M53 back cameras declare `focusMode`, `exposureMode`, `exposureTime` and `exposureCompensation`, and the Galaxy M53 back camera declares `zoom`, so `advanced` sets using them show up in `getSettings()`. The README documents live-track constraints.

Behaviour change: each `applyConstraints()` call now replaces the previous constraint set instead of adding to it, so `getSettings()` drops a setting the latest call no longer asks for. A call the browser rejects leaves the previous settings in place, and overlapping calls settle in the order they were made. Basic constraints now follow the same rules as `getUserMedia`: `exact`, `min` and `max` are mandatory, while `ideal` and bare values settle on the closest supported value instead of rejecting, so `applyConstraints({ zoom: 99 })` no longer throws. `min`/`max` ranges and lists of alternatives are understood. See `MIGRATION.md`.
