---
"@eatsjobs/media-mock": patch
---

Fix the test run hanging on a cold Vite cache.

`three`, used only by the demo page, was being picked up by Vite's dependency optimizer during the browser test run. The resulting re-optimize forced a page reload mid-run, and Vitest wedged instead of finishing — every test had already passed. It only showed up in CI, where the Vite cache is always cold; locally the cache was warm from running the dev server.

The test config now excludes `three` from pre-bundling, and the demo imports it lazily so it is not a static dependency of the page entry.
