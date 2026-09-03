---
"@eatsjobs/media-mock": patch
---

Remove a duplicated README section that documented a `forceReadyState` option the library does not have.

The "Testing with Playwright" and "Unit testing without a browser" sections each appeared twice. Later edits only ever updated the first copy, so the second went stale — and the stale one described `forceReadyState`, an option that was drafted, reconsidered and dropped before release. It was never in the code, but it shipped in the README of 2.2.0.

`MockOptions` in the API reference was always correct: `mediaDevices`, `frames`, `audio` and `emulateVideoFrameCallback`.
