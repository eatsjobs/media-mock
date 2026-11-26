# Permission Prompt Simulation — Design

**Date:** 2026-11-25
**Status:** Draft — awaiting approval (reviewed by builder check)

## Intent

Let tests walk through the camera/microphone **permission flow a real user
goes through**: the app asks, the browser prompt is open, the user allows,
denies or dismisses it, and the app reacts. Today the mock only knows two
states — implicitly *granted* (every `getUserMedia` streams) and *denied*
(`simulateGetUserMediaError("NotAllowedError")`, which rejects instantly).
There is no "prompt is open, user hasn't answered" moment, and
`navigator.permissions` is not mocked at all (it was explicitly out of scope
in `2026-07-28-getusermedia-error-simulation-design.md`).

The behaviour must follow the specs (Permissions API, Media Capture and
Streams). There is **no UI**: the test answers the prompt programmatically.

## Goals

- `navigator.permissions.query({ name: "camera" | "microphone" })` reports the
  mocked state and fires `change` when it changes.
- `getUserMedia` stays pending while a prompt is open, until the test answers.
- The test can **observe** the open prompt (assert the app's "please allow
  camera" UI) before answering.
- Works identically in **Vitest browser mode** and **Playwright** (where the
  test reaches the mock through `page.evaluate`).
- Existing tests keep passing without changes.

## Non-goals

- Any visible prompt UI (no fake dialog in the debug view or demo).
- Browser-specific prompt quirks beyond what is listed below (Chrome's
  dismiss-embargo after 3 dismissals, Safari's per-call re-prompting,
  Firefox's "remember this decision" checkbox, "Allow this time" vs
  "Allow on every visit").
- Permission names other than `camera` and `microphone`.
- Pre-deciding the answer (`permissionPromptAnswer` auto-answer, "approach B"):
  deferred; cheap to add on top later if tests want it.
- Limiting pre-permission `enumerateDevices` to one entry per kind (Chrome
  does this; the mock keeps today's "redact every entry" behaviour).

## Anti-goals

- A test passing while the flow it describes never happened — e.g. answering
  a prompt that was never opened. Such misuse must throw.
- Leaking permission state or a hanging prompt into the next test.
- An API that only works when test code and app share a JS realm (would break
  Playwright).

## Constraints

- **Playwright boundary.** Test code runs in Node, the mock in the page.
  Objects with methods cannot cross `page.evaluate`, so the API is plain
  methods on the `MediaMock` instance returning structured-clonable data.
  "Wait for the prompt" and "answer it" must be separate calls so assertions
  can run between them.
- **Emulators.** The emulator projects (happy-dom, jsdom) run the
  device-emulation half of the library and must cover this feature.
  `navigator.permissions` may be missing (jsdom) — synthesize it the way
  `patchMediaDevices.ts` synthesizes `MediaDevices`.
- **Independent instances.** `createMediaMock()` instances keep separate
  permission state; patching of the shared global follows the existing
  acquire/release ownership pattern.
- **Fluent API**: mutating methods return `this`.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Separate calls: `waitForPermissionPrompt()` then `answerPermissionPrompt(answer)` | Observes the pending state; works across `page.evaluate`. Two calls per prompt. |
| B | Pre-set answer (`configure({ permissionPromptAnswer: "deny" })`), mock answers itself | One line, fits `addInitScript`, but the pending state is unobservable. Deferred, may be layered on A later. |
| — | Prompt handle object (`const p = await nextPrompt(); p.allow()`) | Dropped: a handle with methods cannot cross `page.evaluate`. |

The user picked **A**.

## Public API

```ts
export type MediaPermissionName = "camera" | "microphone";
export type PermissionPromptAnswer = "allow" | "deny" | "dismiss";

export interface PermissionPrompt {
  /** Which permissions this prompt asks for. */
  camera: boolean;
  microphone: boolean;
}

class MediaMockClass {
  /** Sets the permission state. Changing away from "granted" revokes (see below). */
  setPermissionState(name: MediaPermissionName, state: PermissionState): this;

  /**
   * Resolves when a permission prompt is open — immediately if one already is.
   * Resolves with plain data (safe to return from page.evaluate).
   */
  waitForPermissionPrompt(): Promise<PermissionPrompt>;

  /**
   * Answers the open prompt as the user would. Throws if no prompt is open.
   */
  answerPermissionPrompt(answer: PermissionPromptAnswer): this;
}

interface MockOptions {
  /** Whether to replace navigator.permissions.query for camera/microphone. @default true */
  permissions?: boolean;
}
```

`PermissionState` is the DOM lib type (`"granted" | "denied" | "prompt"`).

### Usage

```ts
// Vitest browser mode
MediaMock.mock(devices["iPhone 12"]).setPermissionState("camera", "prompt");
const pending = navigator.mediaDevices.getUserMedia({ video: true });
expect(await MediaMock.waitForPermissionPrompt()).toEqual({ camera: true, microphone: false });
// assert the app's "please allow" UI here
MediaMock.answerPermissionPrompt("allow");
const stream = await pending;
```

```ts
// Playwright — the mock is reached the same way as today, e.g. the UMD
// global `window.MediaMock` installed via page.addInitScript (README "CDN").
await page.evaluate(() => window.MediaMock.MediaMock.setPermissionState("camera", "prompt"));
await page.getByRole("button", { name: "Scan" }).click();
await page.evaluate(() => window.MediaMock.MediaMock.waitForPermissionPrompt());
await expect(page.getByText("Please allow camera access")).toBeVisible();
await page.evaluate(() => { window.MediaMock.MediaMock.answerPermissionPrompt("deny"); });
await expect(page.getByText("Camera blocked")).toBeVisible();
```

**No new way to reach the mock** (user: "should work in vitest browser mode
and playwright as today"). The library does not add a page global; the
Playwright example only uses what consumers already do.

## Behaviour

### State

- Two independent states, `camera` and `microphone`, each
  `"granted" | "denied" | "prompt"`.
- **Default `"granted"`** for both — the mock streams without asking today, so
  existing tests are unaffected.
- `unmock()` resets both to `"granted"` and settles any pending prompt (see
  Teardown). Permission state is scenario state like the simulated error,
  not configuration: it is **not** part of `configure()`/`settings`.

### `navigator.permissions.query`

- For `{ name: "camera" }` / `{ name: "microphone" }`: resolves with a
  `PermissionStatus`-like `EventTarget` exposing `state`, `name` and
  `onchange`, supporting `addEventListener("change", …)`.
- Each call returns a **new** status object (spec); every live status object
  for that name is updated and receives `change` when the state changes.
- `change` is dispatched as a queued task (spec "queue a task"); `state` is
  already updated when it fires. The `onchange` handler and listeners both run.
- Any other name is forwarded to the native `query` if one exists; otherwise
  rejects with `TypeError` as browsers do for unknown names.
- Patched on `Permissions.prototype.query` when present (same reasoning as
  `MediaDevices.prototype`); synthesized `navigator.permissions` otherwise.
  Restored on `unmock()`. Skipped entirely with `mock(device, { permissions: false })`.

### `getUserMedia`

Evaluation order for each call, following the mediacapture-main
`getUserMedia()` steps (checked against the spec source, 2026-11-25). Device
selection happens **before** the permission request; the existing refusal
code in `getMockStream` already runs in that order, so the permission step
slots in after it:

1. Simulated `SecurityError` / `NotAllowedError` — blocked outright, no prompt.
2. Empty request → `TypeError` — unchanged.
3. Device selection and constraint refusal, including a simulated
   `NotFoundError` / `OverconstrainedError` — unchanged, **except** the spec's
   "getUserMedia specific failure is allowed" rule: if any requested kind's
   permission is `"denied"`, a `NotFoundError` or `OverconstrainedError` is
   replaced by `NotAllowedError` (so a denied page can't probe hardware).
   Also per spec, `OverconstrainedError.constraint` is `""` unless device
   information can be exposed — i.e. unless `camera` or `microphone` is
   `"granted"`. With the default state nothing here changes.
4. Permission check over the **requested kinds** (video → `camera`,
   audio → `microphone`):
   - any requested kind `"denied"` → reject `NotAllowedError`
     ("Permission denied"), no prompt;
   - all requested kinds `"granted"` → continue;
   - otherwise → open **one prompt** covering exactly the requested kinds whose
     state is `"prompt"` (spec: UAs are "encouraged to bundle concurrent
     requests for different kinds of media into a single user-facing
     permission prompt"), and wait. Spec: "If the user never responds, this
     algorithm stalls on this step."
5. Simulated `NotReadableError` / `AbortError` — the device fails to start,
   only after permission is granted; the permission stays granted.
6. Stream creation — unchanged.

> **Revised after review (2026-11-26):** the first version threw every
> simulated error at step 1, before any prompt. That made "the user allowed
> the camera, but another app holds it" untestable, so each simulated error
> now fires at the step where a real browser raises it.

Answering the open prompt:

| Answer | Prompted states become | The waiting `getUserMedia` |
|---|---|---|
| `allow` | `"granted"` | continues at step 5 |
| `deny` | `"denied"` | rejects `NotAllowedError`, message "Permission denied" |
| `dismiss` | unchanged (`"prompt"`) | rejects `NotAllowedError`, message "Permission dismissed" (Chromium) |

`allow` persists: later calls stream without prompting until the state is
changed again.

### Concurrent requests

- At most **one prompt open** at a time. Further calls that need a prompt
  queue FIFO.
- When the open prompt is answered, the next queued call **re-runs step 4**
  against the new state — so after `allow` on camera, a queued camera-only
  call resolves without a second prompt; after `deny`, it rejects.

### `waitForPermissionPrompt()`

- Resolves with `{ camera, microphone }` for the open prompt; if none is open,
  resolves when the next one opens.
- No built-in timeout: the test runner's timeout applies.

### `answerPermissionPrompt()`

- Throws an `Error` with a clear message if no prompt is open (anti-goal:
  answering a prompt that never happened). It does **not** queue an answer.

### `setPermissionState()` and revocation

- Updates state and notifies `PermissionStatus` objects.
- Moving a kind **from `"granted"` to anything else** ends that kind's live
  mocked tracks — the spec's "device permission revocation algorithm": "For
  each track in tracks, end the track", where ending a track for a reason
  other than `stop()` sets `readyState` to `"ended"` and fires `ended` in a
  queued task. Video tracks for `camera`, audio tracks for `microphone`.
- Changing state while a prompt is open does not answer the prompt.

### `enumerateDevices` redaction

Generalises today's rule. An entry is redacted when either:

- `NotAllowedError` is simulated (existing behaviour), or
- its kind's permission is not `"granted"`: `videoinput` → `camera`;
  `audioinput` and `audiooutput` → `microphone`.

Redaction itself (`redactMediaDeviceInfo`) is unchanged.

*Deliberate deviation from the spec, matching Chromium:* the spec exposes
device info only after a successful `getUserMedia` (or while a track is live),
not merely because permission is `"granted"`. Following it literally would
redact `enumerateDevices` in every existing test that enumerates before
streaming. Chromium exposes labels once permission is granted, and so does
the mock.

### Interaction with `simulateGetUserMediaError("NotAllowedError")`

A simulated `NotAllowedError` stays a blunt override (step 1), for blocks
the permission state does not explain (OS- or policy-level); a user's
denial is modelled with `setPermissionState`. For consistency, while
`NotAllowedError` is simulated `navigator.permissions.query` reports
`"denied"` for both names, just as `enumerateDevices` already redacts as if
denied. Setting or clearing that error notifies live `PermissionStatus`
objects with `change`. The stored permission states are untouched, so
clearing the error brings back whatever `setPermissionState` set. Other
simulated error names do not affect `query`.

### Teardown

`unmock()` rejects a pending prompt's `getUserMedia` call(s) with
`AbortError`, rejects pending `waitForPermissionPrompt()` promises, resets
states to `"granted"`, drops tracked `PermissionStatus` objects and restores
`navigator.permissions`. Nothing hangs into the next test.

## Code layout (proposal)

- `lib/permissions.ts` — pure-ish permission state machine: states, prompt
  queue, answer handling, kind mapping. No `window` reads; node-testable in
  `tests/unit/`.
- `lib/patchPermissions.ts` — patch/synthesize/restore `navigator.permissions`
  and the `PermissionStatus` stand-in; mirrors `patchMediaDevices.ts`.
- `lib/main.ts` — wires the three public methods, step 3 of `getMockStream`,
  redaction rule, revocation, `unmock()` teardown, `MockOptions.permissions`.
- `lib/deviceRegistry.ts` — `listDevices` takes per-kind redaction instead of
  one boolean.

## Testing (TDD — tests first, then implementation)

- `tests/unit/permissions.test.ts` — state machine: deny/allow/dismiss
  transitions, prompt covers only `"prompt"` kinds, any-denied short-circuit,
  FIFO queue re-evaluation, answer-without-prompt throws.
- `tests/emulator/permissions.test.ts` (both happy-dom and jsdom, mocked with
  `{ frames: false, audio: false }`) — `query` states and `change` events,
  `getUserMedia` pending/allow/deny/dismiss, redaction per kind, `unmock()`
  settles pending prompt and restores `navigator.permissions`, synthesized
  `navigator.permissions` where absent, two `createMediaMock()` instances used
  **one after another** keep separate state (simultaneous mocking stays
  unsupported, as documented for `navigator.mediaDevices`).
- `tests/permissions.test.ts` (browser project, Chromium + WebKit) — full flow
  with real streams, revocation ends live tracks with `ended`, unknown
  permission names forwarded to native `query`, `{ permissions: false }`
  leaves native `query` untouched. **Playwright boundary:** the flow is driven
  with each step in its own task, and every value returned by
  `waitForPermissionPrompt()` passes `structuredClone`, which is what
  `page.evaluate` needs. No separate Node-side Playwright suite is added: the
  repo has none today, and building one (config, fixture page, CI job) is
  out of proportion to what it would add here.

## Documentation

- README: "Simulating the permission prompt" section (Vitest + Playwright
  examples above), API entries for the three methods, types and
  `MockOptions.permissions`; update the Simulating Errors redaction paragraph.
- Changeset: **minor**.
- **Behaviour change to call out:** with the default `"granted"` state, a
  mocked page's `navigator.permissions.query({ name: "camera" })` now resolves
  `"granted"` where it previously returned the browser's real state. Mention in
  the changeset and README with the `{ permissions: false }` opt-out.
  `MIGRATION.md` gets a short note, per the CLAUDE.md rule on public API changes.
- Demo (`src/main.ts`): optional "Simulate prompt" button — builder's call.

## Left to the builder

- Exact error message wording beyond the Chromium strings above.
- Whether the `PermissionStatus` stand-in also satisfies
  `instanceof PermissionStatus` in real browsers (nice-to-have; the native
  constructor is illegal to call).
- Internal structure of the prompt queue.
