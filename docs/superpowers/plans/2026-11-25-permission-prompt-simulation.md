# Permission Prompt Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let tests drive the camera/microphone permission prompt programmatically: `navigator.permissions.query` reports mocked states, `getUserMedia` waits on an open prompt, and the test observes then answers it.

**Architecture:** A DOM-free `PermissionController` (`lib/permissions.ts`) owns states, the prompt queue and answers, and returns outcomes rather than errors. `PermissionsPatcher` (`lib/patchPermissions.ts`) replaces or synthesizes `navigator.permissions.query` and keeps `PermissionStatus` stand-ins up to date. `MediaMockClass` wires the two into `getMockStream`, `enumerateDevices`, the simulated error and `unmock()`.

**Tech Stack:** TypeScript, Vitest 4 (projects `unit`, `emulator-happy-dom`, `emulator-jsdom`, `browser` via Playwright), Biome, Changesets, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-25-permission-prompt-simulation-design.md`

## Global Constraints

- Default state is `"granted"` for both `camera` and `microphone`; existing tests must keep passing unchanged.
- Every value returned to the test (`waitForPermissionPrompt()`) must be structured-clonable (it crosses Playwright's `page.evaluate`).
- New mutating methods return `this`. Existing `simulateGetUserMediaError`/`clearGetUserMediaError` keep their `typeof MediaMock` signatures.
- Messages: deny → `"Permission denied"` (existing default); dismiss → `"Permission dismissed"`; aborted by `unmock()` → `AbortError` with message `"getUserMedia was aborted because the mock was removed"`.
- `answerPermissionPrompt` with no open prompt throws `Error("No permission prompt is open")`. It never queues an answer.
- No new page global; no Node-side Playwright suite.
- TDD on every task: failing test, then implementation (user's global rule).
- Commits: no `Co-Authored-By` and no "Generated with Claude Code" lines (user preference).
- `pnpm lint` (Biome) must pass before each commit.
- Emulator tests mock with `{ frames: false, audio: false }`.

## Review Focus

1. **Concurrent requests (React StrictMode double effect):** two `getUserMedia({ video: true })` calls while `camera` is `"prompt"` → one prompt; after `allow`, both resolve and no second prompt opens. Test in Task 4.
2. **A `PermissionStatus` held across the prompt:** an app that called `query` before asking sees `change` → `"granted"` when the test answers `allow`, and → `"denied"` on `deny`. Test in Task 4.
3. **Bad values from plain JS** (Playwright `evaluate` is untyped): `setPermissionState("mic", "granted")`, `setPermissionState("camera", "allowed")` and `answerPermissionPrompt("yes")` throw `TypeError` naming the bad value. Test in Task 3 / Task 4.
4. **`mock()` twice without `unmock()`:** the patcher must not save its own mock as "the original", and `unmock()` must restore the native `query`. Test in Task 2.
5. **`unmock()` in `afterEach` while a prompt is open:** the app's pending `getUserMedia` rejects with `AbortError`, a pending `waitForPermissionPrompt()` rejects, and the next test starts at `"granted"` with no open prompt. Test in Task 4.

---

### Task 1: `PermissionController` state machine

**Files:**
- Create: `lib/permissions.ts`
- Test: `tests/unit/permissions.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type MediaPermissionName = "camera" | "microphone";
  export type PermissionPromptAnswer = "allow" | "deny" | "dismiss";
  export interface PermissionPrompt { camera: boolean; microphone: boolean }
  export type PermissionOutcome = "granted" | "denied" | "dismissed" | "aborted";
  export const MEDIA_PERMISSION_NAMES: readonly MediaPermissionName[]; // ["camera", "microphone"]

  export class PermissionController {
    state(name: MediaPermissionName): PermissionState;
    set(name: MediaPermissionName, state: PermissionState): void;      // notifies subscribers only when the value changes
    subscribe(listener: (name: MediaPermissionName) => void): () => void;
    request(kinds: PermissionPrompt): Promise<PermissionOutcome>;       // kinds = which media were requested
    readonly openPrompt: PermissionPrompt | null;
    waitForPrompt(): Promise<PermissionPrompt>;
    answer(answer: PermissionPromptAnswer): void;
    reset(): void;
  }
  ```
  `PermissionState` is the DOM lib type (`tsconfig.json` has `lib: ["ES2020", "DOM", "DOM.Iterable"]`, so it type-checks in the node project too).

- [ ] **Step 0: Install dependencies and take a baseline**

Run: `pnpm install && pnpm vitest --run --project unit`
Expected: all existing unit tests PASS.

- [ ] **Step 1: Write the failing tests** in `tests/unit/permissions.test.ts`:
  - `starts with both permissions granted`: `state("camera")` and `state("microphone")` are `"granted"`.
  - `resolves granted without a prompt when every requested kind is granted`: `request({camera:true, microphone:false})` → `"granted"`, `openPrompt` stays `null`.
  - `resolves denied without a prompt when any requested kind is denied`: camera `"denied"`, mic `"prompt"`, `request({camera:true, microphone:true})` → `"denied"`, `openPrompt` is `null`.
  - `opens one prompt covering only the kinds still in prompt state`: camera `"granted"`, mic `"prompt"`, `request({camera:true, microphone:true})` → `openPrompt` equals `{ camera: false, microphone: true }`.
  - `allow grants the prompted kinds and resolves granted`: afterwards `state("camera")` is `"granted"`, and the promise resolves `"granted"`.
  - `deny denies the prompted kinds and resolves denied`.
  - `dismiss leaves the state at prompt and resolves dismissed`.
  - `waitForPrompt resolves immediately when a prompt is already open`, and `waitForPrompt resolves once the next prompt opens` (waiter registered before `request`). Both resolve `{ camera: true, microphone: false }`, and `structuredClone(result)` deep-equals the result.
  - `answer throws when no prompt is open`: `expect(() => c.answer("allow")).toThrow("No permission prompt is open")`. Also: answering a second time after one answer throws the same error.
  - `answer rejects unknown answers`: `c.answer("yes" as never)` throws `TypeError` whose message contains `"yes"`.
  - `queues concurrent requests and re-evaluates them after the answer`: camera `"prompt"`; two `request({camera:true, microphone:false})` calls; only one prompt is open; `answer("allow")`; both resolve `"granted"`; `openPrompt` is `null`.
  - `a queued request is denied once the open prompt is denied`: same setup, `answer("deny")` → both `"denied"`.
  - `a queued request for another kind gets its own prompt after the first is answered`: camera-only, then mic-only; after `answer("allow")`, `openPrompt` is `{ camera: false, microphone: true }`.
  - `subscribe is notified on change but not when the value is unchanged`: `set("camera","granted")` from `"granted"` → no call; `set("camera","prompt")` → called with `"camera"`. Answering `allow` notifies each prompted name. The returned unsubscribe stops notifications.
  - `reset aborts pending requests, rejects waiters and restores granted`: open prompt plus one queued request plus a `waitForPrompt` waiter registered with no prompt open (use a second controller for that case). `reset()` → requests resolve `"aborted"`, the waiter rejects, both states are `"granted"`, `openPrompt` is `null`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest --run --project unit tests/unit/permissions.test.ts`
Expected: FAIL, cannot resolve `../../lib/permissions`.

- [ ] **Step 3: Implement `PermissionController` in `lib/permissions.ts`**

Use a FIFO array of `{ kinds, resolve }` entries. Only the head entry can hold the open prompt. `advance()` evaluates the head:
- any requested kind `"denied"` → resolve `"denied"`
- all requested kinds `"granted"` → resolve `"granted"`
- otherwise → set `openPrompt` to the requested kinds whose state is `"prompt"` and flush the `waitForPrompt` waiters

`advance()` repeats until the queue is empty or a prompt is open. `answer()` validates its argument and applies the state change through `set()` (so subscribers fire). It then resolves the head with `allow → "granted"`, `deny → "denied"`, `dismiss → "dismissed"`, clears `openPrompt` and calls `advance()`. `waitForPrompt` returns a copy (`{ ...openPrompt }`), never the internal object. In `reset`, waiters reject with `Error("MediaMock was unmocked while waiting for a permission prompt")`.

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm vitest --run --project unit tests/unit/permissions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm lint && git add lib/permissions.ts tests/unit/permissions.test.ts
git commit -m "feat: add permission prompt state machine"
```

---

### Task 2: `PermissionsPatcher` for `navigator.permissions.query`

**Files:**
- Create: `lib/patchPermissions.ts`
- Test: `tests/emulator/patchPermissions.test.ts` (runs under happy-dom and jsdom)

**Interfaces:**
- Consumes: `MediaPermissionName`, `MEDIA_PERMISSION_NAMES` from Task 1.
- Produces:
  ```ts
  export class PermissionsPatcher {
    /** Replaces query for camera/microphone; `read` returns the effective state at call time. */
    install(read: (name: MediaPermissionName) => PermissionState): void;
    /** Queues a task that updates every live status for `name` to read(name) and fires `change` if it differs. */
    notify(name: MediaPermissionName): void;
    restore(): void;
    get installed(): boolean;
  }
  ```

- [ ] **Step 1: Write the failing tests.** Each test creates `new PermissionsPatcher()` and calls `restore()` in `afterEach`. Use a mutable `states` record as the `read` source, and `nextChange(status)` = a promise for the next `change` event.
  - `query reports the state read at call time for camera and microphone`: `(await navigator.permissions.query({ name: "camera" as PermissionName })).state` is `"prompt"` when `states.camera = "prompt"`, and `.name` is `"camera"`.
  - `each query returns a new status object`: two queries are `!==` each other.
  - `notify fires change on every live status with the new state`: two statuses; set `states.camera = "denied"`; `notify("camera")`. Before the task runs, `status.state` is still the old value. After `await nextChange(a)`, both `a.state` and `b.state` are `"denied"`, and `onchange` was called once on a status that set it.
  - `notify does not fire when the state is unchanged`: `notify("camera")` with no change → no `change` event after `await new Promise(r => setTimeout(r, 10))`.
  - `notify for camera does not touch microphone statuses`.
  - `unknown names reject with TypeError when there is no native query`: run this only where `install` had to synthesize (jsdom). `query({ name: "geolocation" })` rejects `TypeError`.
  - `synthesizes navigator.permissions where it is missing and removes it on restore`: if `navigator.permissions` was `undefined` before `install` (jsdom), it is defined after `install` and `undefined` again after `restore`. Otherwise, after `restore` `navigator.permissions.query` is the original function.
  - `installing twice keeps the native query restorable` (Review Focus 4): capture `const native = navigator.permissions?.query`, call `install` twice, `restore()` once, and expect `navigator.permissions?.query` to be `native`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest --run --project emulator-happy-dom --project emulator-jsdom tests/emulator/patchPermissions.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `PermissionsPatcher` in `lib/patchPermissions.ts`**

- **Patching.** Follow `patchMediaDevices.ts`. When `typeof Permissions !== "undefined"`, patch `Permissions.prototype.query`, capturing the original only on the first install, and copy the native `name`/`length` onto the mock. Otherwise define `navigator.permissions` as `{ query }` (configurable, writable) and remember the previous descriptor. If `navigator` is missing, do nothing: the `MediaDevicesPatcher` already invents it when needed. `install` is called after `MediaDevicesPatcher.patch`.
- **Status objects.** `class MockPermissionStatus extends EventTarget` with a readonly `name`, a `state` you write internally, and an `onchange` property; `dispatchEvent` calls `onchange` too. Keep the live ones in a `Map<MediaPermissionName, Set<MockPermissionStatus>>`, which `restore()` clears.
- **`notify`.** Uses `setTimeout(…, 0)` as the queued task. The task reads the state at run time, so several rapid changes collapse into one event.
- **Non-media names.** Forward to the original via `original.call(this, descriptor)`. With no original, reject `new TypeError(\`Failed to execute 'query' on 'Permissions': The provided value '${name}' is not a valid enum value of type PermissionName.\`)`.

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm vitest --run --project emulator-happy-dom --project emulator-jsdom tests/emulator/patchPermissions.test.ts`
Expected: PASS in both.

- [ ] **Step 5: Commit**

```bash
pnpm lint && git add lib/patchPermissions.ts tests/emulator/patchPermissions.test.ts
git commit -m "feat: patch navigator.permissions.query for camera and microphone"
```

---

### Task 3: Wire permission state into `MediaMock` (query, redaction, simulated error, options)

**Files:**
- Modify: `lib/main.ts` — `MockOptions`/`ResolvedMockOptions`/`resolveMockOptions` (~57-135), `mock()` (~704-748), `unmock()` (~758), `simulateGetUserMediaError`/`clearGetUserMediaError` (~848-866), `enumerateMockDevices` (~873), exports (~1100)
- Modify: `lib/deviceRegistry.ts:107-114` (`listDevices`)
- Test: `tests/unit/deviceRegistry.test.ts:125-160`, `tests/emulator/permissions.test.ts` (new)

**Interfaces:**
- Consumes: Task 1 `PermissionController`, types; Task 2 `PermissionsPatcher`.
- Produces:
  ```ts
  // lib/deviceRegistry.ts — replaces { redacted: boolean }
  export function listDevices(config: DeviceConfig, redact: { camera: boolean; microphone: boolean }): MockMediaDeviceInfo[];
  // videoinput → redact.camera; audioinput and audiooutput → redact.microphone

  // lib/main.ts
  interface MockOptions { permissions?: boolean }               // default true
  class MediaMockClass {
    setPermissionState(name: MediaPermissionName, state: PermissionState): this;
    private effectivePermissionState(name: MediaPermissionName): PermissionState; // "denied" while NotAllowedError is simulated, else stored
  }
  export type { MediaPermissionName, PermissionPrompt, PermissionPromptAnswer };
  ```

- [ ] **Step 1: Write the failing tests**
  - In `tests/unit/deviceRegistry.test.ts`, switch the existing calls to the new signature: `{ redacted: false }` → `{ camera: false, microphone: false }`, `{ redacted: true }` → `{ camera: true, microphone: true }`. Add `redacts only the kinds whose permission is missing`: with `{ camera: true, microphone: false }`, the videoinput entries have `label === ""` while audioinput and audiooutput keep their labels. With `{ camera: false, microphone: true }` it's the other way round, and audiooutput is redacted along with audioinput.
  - New `tests/emulator/permissions.test.ts`, following the shape of `tests/emulator/mock.test.ts` (one `createMediaMock()`, `afterEach(() => mock.unmock())`, `frameless`):
    - `query reports granted by default`.
    - `query reports the state set with setPermissionState`.
    - `a held PermissionStatus fires change when the state is set`.
    - `setPermissionState is chainable` (returns `mock`).
    - `setPermissionState rejects unknown names and states` (Review Focus 3): `mock.setPermissionState("mic" as never, "granted")` and `("camera", "allowed" as never)` throw `TypeError` mentioning the bad value.
    - `query reports denied while NotAllowedError is simulated, and the stored state again once cleared`: set camera `"prompt"`, simulate → `"denied"` and a held status fires `change`; clear → `"prompt"`.
    - `other simulated errors do not affect query`: `NotReadableError` → `"granted"`.
    - `enumerateDevices redacts cameras while camera permission is not granted`: camera `"prompt"` → videoinput entries are redacted and audioinput entries keep their labels.
    - `enumerateDevices redacts microphones while microphone permission is not granted`.
    - `unmock resets permissions to granted`: set `"denied"`, `unmock()`, `mock()` again → `query` reports `"granted"`.
    - `unmock restores navigator.permissions`: capture `navigator.permissions?.query` before `mock()`; after `unmock()` it is identical (or `navigator.permissions` is `undefined` again in jsdom).
    - `permissions: false leaves navigator.permissions alone`: `mock.mock(devices["iPhone 12"], { ...frameless, permissions: false })` → `navigator.permissions?.query` is unchanged.
    - `two instances used one after another keep separate state`: instance A sets camera `"denied"` and unmocks; instance B mocks → `"granted"`.
    - Keep the existing `should redact enumerateDevices while permission is denied` test in `tests/emulator/mock.test.ts` passing unchanged.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest --run --project unit tests/unit/deviceRegistry.test.ts && pnpm vitest --run --project emulator-happy-dom --project emulator-jsdom tests/emulator/permissions.test.ts`
Expected: FAIL (`listDevices` signature, `setPermissionState` is not a function).

- [ ] **Step 3: Implement the wiring**

- `listDevices` takes the new per-kind `redact` argument.
- `enumerateMockDevices` passes `{ camera: effectivePermissionState("camera") !== "granted", microphone: effectivePermissionState("microphone") !== "granted" }`. The `NotAllowedError` case is already covered because the effective state is `"denied"` then.
- `mock()` calls `permissionsPatcher.install(name => this.effectivePermissionState(name))` when `resolved.permissions`, and subscribes the patcher's `notify` to the controller once per instance.
- `simulateGetUserMediaError`/`clearGetUserMediaError` read the effective state of each name before and after, and `notify` the names that changed.
- `unmock()` calls `permissions.reset()` and `permissionsPatcher.restore()`.
- `setPermissionState` validates against `MEDIA_PERMISSION_NAMES` and `["granted","denied","prompt"]`, then calls `permissions.set`. (Task 5 adds revocation.)
- Export the three types.

- [ ] **Step 4: Run them to verify they pass, along with everything that existed before**

Run: `pnpm vitest --run --project unit --project emulator-happy-dom --project emulator-jsdom`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm lint && git add lib/main.ts lib/deviceRegistry.ts tests/unit/deviceRegistry.test.ts tests/emulator/permissions.test.ts
git commit -m "feat: report mocked camera and microphone permission state"
```

---

### Task 4: `getUserMedia` waits on the prompt; `waitForPermissionPrompt` / `answerPermissionPrompt`

**Files:**
- Modify: `lib/main.ts` — `getMockStream` (~880-978), new public methods next to `setPermissionState`
- Test: `tests/emulator/permissions.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 `request`, `waitForPrompt`, `answer`, `PermissionOutcome`; Task 3 wiring.
- Produces:
  ```ts
  waitForPermissionPrompt(): Promise<PermissionPrompt>;
  answerPermissionPrompt(answer: PermissionPromptAnswer): this;
  ```

- [ ] **Step 1: Write the failing tests** (emulator, frameless; `getUserMedia` resolves a synthetic stream there):
  - `getUserMedia stays pending while the prompt is open`: camera `"prompt"`; start `getUserMedia({ video: true })`; `await mock.waitForPermissionPrompt()` equals `{ camera: true, microphone: false }`. The call is still pending: race it against `setTimeout(…, 20)` and expect the timeout to win.
  - `allow resolves the stream and grants camera`: the stream has one video track, and `query` reports `"granted"`.
  - `deny rejects NotAllowedError "Permission denied" and denies camera`; a later `getUserMedia` rejects immediately with no prompt (`waitForPermissionPrompt` is not needed; the call settles on its own).
  - `dismiss rejects NotAllowedError "Permission dismissed" and keeps prompt`; a later call opens a new prompt.
  - `answerPermissionPrompt throws when no prompt is open`: `"No permission prompt is open"`.
  - `answerPermissionPrompt rejects unknown answers` (Review Focus 3).
  - `concurrent requests share one prompt` (Review Focus 1): two `getUserMedia({ video: true })` calls; after `answerPermissionPrompt("allow")`, both resolve, and `waitForPermissionPrompt` raced against a 20 ms timeout loses (no new prompt).
  - `a PermissionStatus held across the prompt sees the answer` (Review Focus 2): query camera while it is `"prompt"`, then allow → `change` with `state === "granted"`. Repeat with deny → `"denied"`.
  - `unmock while a prompt is open settles everything` (Review Focus 5): start `getUserMedia`, and start a `waitForPermissionPrompt()` on a fresh mock before any request. `unmock()` → `getUserMedia` rejects with `name === "AbortError"` and the exact message from Global Constraints, and the waiter rejects. After `mock()` again, `query` is `"granted"` and `answerPermissionPrompt` throws.
  - `denied turns NotFoundError into NotAllowedError`: with `audio: false`, the emulator refuses `getUserMedia({ audio: true })` with `NotFoundError` (no microphone). With `microphone` `"denied"`, the same call rejects `NotAllowedError`, and with `"prompt"` it still rejects `NotFoundError` without opening a prompt (selection runs before the permission request).
  - `OverconstrainedError hides the constraint until a permission is granted`: camera and microphone `"prompt"`, `video: { width: { exact: 99999 } }` → `OverconstrainedError` with `constraint === ""`, and no prompt opens. With the default `"granted"`, `constraint === "width"` (existing behaviour).
  - `the simulated error still wins over the prompt`: camera `"prompt"` plus `simulateGetUserMediaError("NotReadableError")` → rejects `NotReadableError` and no prompt opens.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest --run --project emulator-happy-dom --project emulator-jsdom tests/emulator/permissions.test.ts`
Expected: the new tests FAIL (`getUserMedia` resolves at once, methods missing).

- [ ] **Step 3: Implement it in `getMockStream` and add the two public methods**

The order follows spec §Behaviour/getUserMedia:
1. Leave the existing simulated-error, empty-request, `NotFoundError` and `OverconstrainedError` checks where they are. Route their errors through `private selectionFailure(error: Error, kinds: PermissionPrompt): Error`:
   - if any requested kind is `"denied"`, it returns `createGetUserMediaError("NotAllowedError")`
   - for `OverconstrainedError` when neither name is `"granted"`, it rebuilds the error with `constraint: ""`
   - otherwise it returns the error unchanged
2. After the `canPaintFrames` check and before building any tracks, `await this.permissions.request({ camera: wantsVideo, microphone: wantsAudio })` and map the outcome:
   - `"denied"` → `NotAllowedError`
   - `"dismissed"` → `NotAllowedError` with message `"Permission dismissed"`
   - `"aborted"` → `AbortError` with the Global Constraints message
   - `"granted"` → continue

`waitForPermissionPrompt` delegates to the controller. `answerPermissionPrompt` delegates and returns `this`.

- [ ] **Step 4: Run them to verify they pass, along with the full non-browser suite**

Run: `pnpm vitest --run --project unit --project emulator-happy-dom --project emulator-jsdom`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm lint && git add lib/main.ts tests/emulator/permissions.test.ts
git commit -m "feat: hold getUserMedia on a permission prompt the test answers"
```

---

### Task 5: Revocation ends live tracks

**Files:**
- Modify: `lib/track.ts` (add `endTrack`), `lib/main.ts` (track live tracks; revoke in `setPermissionState`)
- Test: `tests/unit/track.test.ts` (extend), `tests/emulator/permissions.test.ts` (extend)

**Interfaces:**
- Produces:
  ```ts
  // lib/track.ts
  /** Ends a track the way a UA does: in a queued task, readyState "ended", exactly one `ended` event. No-op if already ended. */
  export function endTrack(track: MediaStreamTrack): void;
  ```
- `MediaMockClass` keeps `private readonly liveTracks = new Set<MediaStreamTrack>()`. It adds every track `getMockStream` returns, removes a track when it is ended, and clears the set in `unmock()`. (`ownStreams` is a `WeakSet` and can't be iterated.)

- [ ] **Step 1: Write the failing tests**
  - In `tests/unit/track.test.ts`, use an `EventTarget`-based fake with `readyState` and `stop()`. Run it in two variants: a real-style `stop()` that fires nothing, and a synthetic-style `stop()` that dispatches `ended` itself.
    - `endTrack ends the track in a later task with exactly one ended event`: synchronously after the call, `readyState` is still `"live"`. After `await new Promise(r => setTimeout(r, 0))`, it is `"ended"`, and the `ended` listener count is `1` in both variants.
    - `endTrack does nothing to an already ended track`: zero events.
  - In `tests/emulator/permissions.test.ts`:
    - `revoking camera ends live video tracks`: get a stream (default granted), then `setPermissionState("camera", "denied")` → the video track fires `ended` and `readyState === "ended"`.
    - `resetting camera to prompt also ends live video tracks`.
    - `revoking microphone leaves video tracks live`.
    - `setting granted again does not end anything`.
    - `changing the state while a prompt is open does not answer it`: open a prompt, `setPermissionState("microphone", "denied")` → `answerPermissionPrompt("allow")` still works and the stream resolves.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest --run --project unit tests/unit/track.test.ts && pnpm vitest --run --project emulator-happy-dom --project emulator-jsdom tests/emulator/permissions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `endTrack`, live-track tracking, and revocation in `setPermissionState`**

- **Revocation.** In `setPermissionState`, moving from `"granted"` to anything else ends live tracks of the matching kind: `camera` → `"video"`, `microphone` → `"audio"`.
- **`endTrack`.** Listen once for `ended`, call `stop()`, then dispatch `ended` only if `stop()` did not.

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm vitest --run --project unit --project emulator-happy-dom --project emulator-jsdom`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm lint && git add lib/track.ts lib/main.ts tests/unit/track.test.ts tests/emulator/permissions.test.ts
git commit -m "feat: end live tracks when a granted permission is revoked"
```

---

### Task 6: Real-browser coverage (Chromium + WebKit)

**Files:**
- Test: `tests/permissions.test.ts` (new, browser project)
- Modify: only if the tests expose a real-browser difference (most likely in `lib/patchPermissions.ts`)

**Interfaces:**
- Consumes: the public API from Tasks 3-5, through the `MediaMock` singleton, as `tests/getUserMediaError.test.ts` does (`beforeEach`/`afterAll` → `MediaMock.unmock()`, `await MediaMock.setSource("/assets/ean8_12345670.png")`).

- [ ] **Step 1: Write the tests**
  - `full flow with real frames`: camera `"prompt"` → `getUserMedia({ video: true })` pending → `waitForPermissionPrompt()` → `allow` → the stream's video track has `readyState === "live"`, and `query` reports `"granted"`.
  - `every step can run in its own task, as page.evaluate does`: split the steps with `await new Promise(r => setTimeout(r, 0))` between them, and check that `structuredClone(await MediaMock.waitForPermissionPrompt())` deep-equals the original.
  - `query patches the native Permissions prototype`: after `mock()`, `navigator.permissions.query === Permissions.prototype.query`, and `query.name === "query"`.
  - `unknown permission names reach the native query`: `navigator.permissions.query({ name: "notifications" as PermissionName })` resolves with a native `PermissionStatus` (`instanceof PermissionStatus`).
  - `permissions: false leaves the native query in place`: with `MediaMock.mock(devices["iPhone 12"], { permissions: false })`, `navigator.permissions.query` is the native function captured before `mock()`.
  - `one prompt covers camera and microphone requested together`: both `"prompt"`, `getUserMedia({ video: true, audio: true })` → `waitForPermissionPrompt()` equals `{ camera: true, microphone: true }`; `allow` → the stream has one video and one audio track, and both states are `"granted"`. (This lives here because the emulators refuse audio with `NotFoundError` before any prompt.)
  - `revocation ends a real capture track with one ended event`.
  - `deny and dismiss reject with the expected messages`.

- [ ] **Step 2: Run them**

Run: `pnpm vitest --run --project browser tests/permissions.test.ts`
Expected: PASS on Chromium and WebKit. This task proves real-browser fidelity of code that's already built, so a pass on the first run is acceptable. Any failure is a real-browser difference: fix it in the module that owns it, and re-run.

- [ ] **Step 3: Run the whole suite**

Run: `pnpm test`
Expected: every project PASSES.

- [ ] **Step 4: Commit**

```bash
pnpm lint && git add tests/permissions.test.ts lib/
git commit -m "test: cover the permission prompt flow in real browsers"
```

---

### Task 7: Documentation, changeset, demo note

**Files:**
- Modify: `README.md` (feature bullet ~61; new section after "Simulating Errors" ~391-452; API entries after `clearGetUserMediaError` ~560; `MockOptions` ~743; ToC ~18-48; "What works" line ~843)
- Modify: `MIGRATION.md` (short "2.x additions" note on the `query` behaviour change)
- Modify: `CLAUDE.md` (one line under Key Concepts: permission prompt simulation, `lib/permissions.ts` + `lib/patchPermissions.ts`)
- Create: `.changeset/permission-prompt-simulation.md`

- [ ] **Step 1: Write the README section "Simulating the permission prompt"**

Include:
- the Vitest example and the Playwright example from the spec §Usage, verbatim
- the allow/deny/dismiss table
- the concurrency and revocation rules
- the `simulateGetUserMediaError("NotAllowedError")` → `query` "denied" rule
- the Chromium-style label exposure note
- the behaviour-change callout, with the `{ permissions: false }` opt-out

Add API entries for `setPermissionState`, `waitForPermissionPrompt`, `answerPermissionPrompt`, the three types and `MockOptions.permissions`. Update the "enumerateDevices while permission is denied" paragraph to the per-kind rule.

- [ ] **Step 2: Write the changeset**

```md
---
"@eatsjobs/media-mock": minor
---

Simulate the camera/microphone permission prompt: `setPermissionState`, `waitForPermissionPrompt` and `answerPermissionPrompt`, with `navigator.permissions.query` mocked for `camera` and `microphone`. While mocked, `query` now reports the mock's state (`"granted"` by default) instead of the browser's; pass `{ permissions: false }` to `mock()` to keep the native behaviour.
```

- [ ] **Step 3: Verify the build and package checks**

Run: `pnpm build && pnpm lint`
Expected: `tsc`, tsdown, `attw` and `publint` all succeed, and Biome is clean.

- [ ] **Step 4: Commit**

```bash
git add README.md MIGRATION.md CLAUDE.md .changeset/permission-prompt-simulation.md
git commit -m "docs: document permission prompt simulation"
```

The demo button in `src/main.ts` is the builder's call per the spec. If added, do it here with a manual check via `pnpm dev`.
