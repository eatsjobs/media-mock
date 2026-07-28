# getUserMedia Error Simulation — Design

**Date:** 2026-07-28
**Status:** Approved

## Purpose

Let tests exercise media error paths (permission denied, no camera, hardware failure, unsatisfiable constraints) that today cannot be triggered through `@eatsjobs/media-mock`, because the mocked `getUserMedia` always succeeds.

## API

Two new chainable methods on `MediaMockClass`, plus one exported type:

```typescript
export type GetUserMediaErrorName =
  | "NotAllowedError"      // user denied permission
  | "NotFoundError"        // no matching device
  | "NotReadableError"     // hardware/OS-level error
  | "OverconstrainedError" // unsatisfiable constraints
  | "AbortError"
  | "SecurityError";

export interface SimulatedErrorOptions {
  /** Override the realistic default message. */
  message?: string;
  /** OverconstrainedError only: the offending constraint name, e.g. "width". */
  constraint?: string;
}

simulateGetUserMediaError(
  name: GetUserMediaErrorName,
  options?: SimulatedErrorOptions,
): typeof MediaMock;

clearGetUserMediaError(): typeof MediaMock;
```

## Semantics

- **Persistent until cleared.** While set, every mocked `getUserMedia` call
  rejects. `clearGetUserMediaError()` restores normal streaming.
- The rejection happens **before** any canvas/stream/media-loading work in
  `getMockStream`.
- A **fresh error instance is constructed per call**, matching real browsers
  (two rejections never share one object).
- `unmock()` clears the simulated error (consistent with resetting the video
  tracks handler).
- `getSupportedConstraints` is unaffected.

### enumerateDevices redaction (NotAllowedError only)

While the simulated error is `NotAllowedError`, the mocked `enumerateDevices`
resolves (never rejects) with **redacted** device entries, mirroring real
pre-permission browser behavior:

- `kind` is preserved;
- `label`, `deviceId`, and `groupId` are empty strings;
- `getCapabilities()` returns `{}`;
- `toJSON()` reflects the redacted values;
- the returned objects are fresh copies — the configured device list and the
  exported presets are never mutated.

Clearing the error (or `unmock()`) makes `enumerateDevices` return the full
device info again. Other simulated error names do not affect
`enumerateDevices`.

## Error construction

New module `lib/createGetUserMediaError.ts`:

```typescript
export function createGetUserMediaError(
  name: GetUserMediaErrorName,
  options?: SimulatedErrorOptions,
): DOMException;
```

- Standard errors: `new DOMException(message ?? defaultMessage[name], name)`.
  Default messages mirror Chromium:
  - `NotAllowedError` → "Permission denied"
  - `NotFoundError` → "Requested device not found"
  - `NotReadableError` → "Could not start video source"
  - `AbortError` → "Starting videoinput failed"
  - `SecurityError` → "MediaDevices access is not allowed in this context"
  - `OverconstrainedError` → "" (browsers leave it empty; `constraint` carries
    the information)
- `OverconstrainedError`: use the native `OverconstrainedError` constructor
  when available (Chromium); otherwise fall back to a `DOMException` with
  `name === "OverconstrainedError"` and a `constraint` own-property attached
  (WebKit/Firefox do not expose the constructor).

## Internal state and data flow

- Private field on `MediaMockClass`:
  `simulatedGetUserMediaError: { name: GetUserMediaErrorName; options?: SimulatedErrorOptions } | null`
  (store name+options, not an Error instance, so each rejection constructs a
  fresh error).
- `getMockStream` checks the field first and throws the constructed error.
- The mocked `enumerateDevices` checks
  `simulatedGetUserMediaError?.name === "NotAllowedError"` and maps the device
  list through a `redactMediaDeviceInfo` helper.

## Testing (TDD)

New `tests/getUserMediaError.test.ts`, written test-first:

1. `getUserMedia` rejects with `DOMException` of the requested `name`.
2. Default message is realistic; `message` option overrides it.
3. `OverconstrainedError` rejection exposes `constraint`.
4. Two consecutive rejections are distinct instances.
5. `clearGetUserMediaError()` restores a working stream.
6. `unmock()` clears the simulated error.
7. While `NotAllowedError` is simulated, `enumerateDevices` resolves with
   entries whose `label`/`deviceId`/`groupId` are `""` and `kind` preserved.
8. Redaction does not mutate the configured devices; clearing restores full
   info.
9. Methods are chainable (`return this`).

## Documentation

- README: new "Simulating errors" usage section + API entries for both
  methods, `GetUserMediaErrorName`, and the redaction behavior.
- Changeset: **minor** bump (new feature).

## Out of scope (deliberate)

- One-shot / queued errors.
- Automatic `OverconstrainedError` detection from unsatisfiable constraints.
- `navigator.permissions` mocking.
- Explicit `enumerateDevices` rejection API.
