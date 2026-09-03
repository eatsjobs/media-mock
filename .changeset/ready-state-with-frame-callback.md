---
"@eatsjobs/media-mock": minor
---

`emulateVideoFrameCallback` now also reports `readyState`, which WebKit on Linux never advances.

The option already stood in for `requestVideoFrameCallback`. It turned out to cover only half the problem: both readiness signals are derived from frame *presentation*, which WebKit on Linux never performs, so `readyState` stays at `HAVE_FUTURE_DATA` (3) forever as well. Fixing the callback did nothing for it — measured over five seconds against a mocked stream, `readyState` reached 4 in none of headless, xvfb, with the callback driver installed or without, while frames decoded at roughly 28fps throughout. Consumers polling `readyState === 4` — a third-party SDK you cannot edit, typically — never started.

| WebKit on Linux | rVFC calls | `readyState` reached 4 | after frames stop |
| --- | --- | --- | --- |
| xvfb, default | 0 | never | 2 |
| xvfb, with the option | 139 | 501ms | 2 |
| headless, default | 136 | never | 2 |
| headless, with the option | 139 | 502ms | 2 |

Both answers come from the same evidence: the video's decoded frame count advancing. Neither speaks before a frame has arrived, and both fall silent again when frames stop — the last column above — so a stalled stream still looks stalled. Only videos playing a stream this library produced are affected, and `unmock()` restores both the callback and the property.

Still off by default, and waiting on `playing` or `canplay` remains the better approach wherever the waiting code is yours to change.
