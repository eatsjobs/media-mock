---
"@eatsjobs/media-mock": patch
---

Fix `getUserMedia()` throwing a `TypeError` when the device config lists no `videoResolutions`, and extract constraint parsing and resolution matching into pure internal modules.

A `DeviceConfig` with an empty `videoResolutions` array made `getUserMedia()` fail with `Cannot read properties of undefined (reading 'resolution')`: the best-fit search indexed into an empty scored list, and the fallback that was supposed to handle this case sat behind it as unreachable code. Such a config now resolves to 640x480 (swapped to 480x640 in portrait).

Internal restructuring, with no public API change:

- `lib/constraints.ts` — one unwrapping implementation for constrainable values, replacing four near-duplicate copies that each re-derived `exact`/`ideal`/`max` handling. That duplication is what allowed `frameRate: { exact: n }` to be ignored in an earlier release.
- `lib/resolution.ts` — resolution matching as a pure function taking orientation as an argument instead of reading `window`, and never mutating the caller's resolution list.

Both modules are DOM-free and covered by a new node-environment Vitest project (`tests/unit/**`), so 30 assertions that previously required booting a browser now run in about 100ms. Seven browser tests that reached into private methods and could only assert "defined and greater than zero" were replaced by unit tests pinning exact expected resolutions.
