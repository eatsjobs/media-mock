---
"@eatsjobs/media-mock": patch
---

Fix broken TypeScript declarations for CommonJS consumers, and bundle with [tsdown](https://tsdown.dev) instead of Vite.

`dist/main.d.cts` was a byte-copy of `dist/main.d.ts`, and both contained only `export * from './lib/main'`. Under `node16`/`nodenext` module resolution the CJS side needs `lib/main.d.cts`, which was never emitted, so `require()` consumers hit an unresolvable type import. `arethetypeswrong` now reports the package as clean on all resolution modes, and `publint` reports no issues; both run on every build.

Published file names changed as part of the move:

| Before | After |
| --- | --- |
| `dist/media-mock.js` | `dist/main.js` |
| `dist/media-mock.cjs` | `dist/main.cjs` |
| `dist/media-mock.umd.min.js` | `dist/main.umd.js` |

The package entry points (`main`, `module`, `types`, `exports`, `unpkg`, `jsdelivr`) all point at the new paths, so `import`, `require`, and bare CDN URLs such as `https://cdn.jsdelivr.net/npm/@eatsjobs/media-mock` are unaffected. Only code that deep-linked to a versioned `dist/media-mock.*` path needs updating.

The published tarball no longer contains test type declarations (`dist/tests/**`) or a `dist/lib/**` declaration tree — the whole `dist` is now five files.
