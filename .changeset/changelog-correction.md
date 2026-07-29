---
"@eatsjobs/media-mock": patch
---

Correct the 2.0.0 changelog, which wrongly stated that `setMediaURL()` kept working as an alias for `setSource()`.

The method is removed: it appears nowhere in `dist/main.js`, `dist/main.cjs` or `dist/main.d.ts`, and calling it fails with `TypeError: MediaMock.setMediaURL is not a function`. The claim came from a changeset written for an earlier, non-breaking release and was carried into the 2.0.0 entry unchanged, so it shipped alongside the breaking note that contradicted it.

The 2.0.0 entry now records the removal, with a note explaining the correction, and `MIGRATION.md` states that the method is removed rather than deprecated. No code changes.
