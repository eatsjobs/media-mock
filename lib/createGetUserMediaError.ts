/**
 * The error names a real `getUserMedia` call can reject with.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#exceptions
 */
export type GetUserMediaErrorName =
  | "NotAllowedError"
  | "NotFoundError"
  | "NotReadableError"
  | "OverconstrainedError"
  | "AbortError"
  | "SecurityError";

export interface SimulatedErrorOptions {
  /**
   * Override the realistic default message for the error name.
   * @type {string}
   */
  message?: string;

  /**
   * `OverconstrainedError` only: the name of the constraint that could not be
   * satisfied, e.g. `"width"`.
   * @type {string}
   */
  constraint?: string;
}

/**
 * Messages mirroring the ones Chromium produces, so assertions written against
 * a mocked failure keep holding against a real browser.
 */
const defaultMessages: Record<GetUserMediaErrorName, string> = {
  NotAllowedError: "Permission denied",
  NotFoundError: "Requested device not found",
  NotReadableError: "Could not start video source",
  // Browsers leave OverconstrainedError's message empty — `constraint` carries
  // the information.
  OverconstrainedError: "",
  AbortError: "Starting videoinput failed",
  SecurityError: "MediaDevices access is not allowed in this context",
};

/**
 * Builds the error a mocked `getUserMedia` call rejects with.
 *
 * @export
 * @param {GetUserMediaErrorName} name
 * @param {SimulatedErrorOptions} [options]
 * @returns {Error}
 */
export function createGetUserMediaError(
  name: GetUserMediaErrorName,
  options?: SimulatedErrorOptions,
): Error {
  const message = options?.message ?? defaultMessages[name];

  if (name === "OverconstrainedError") {
    return createOverconstrainedError(message, options?.constraint ?? "");
  }

  return new DOMException(message, name);
}

/** Whether a constructed error actually reports itself as the right one. */
function looksOverconstrained(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { name?: unknown }).name === "OverconstrainedError"
  );
}

/**
 * `OverconstrainedError` is its own interface rather than a DOMException name.
 * Chromium exposes a constructor for it; WebKit and Firefox don't, so there we
 * fall back to a DOMException carrying the same `name` and `constraint`.
 */
function createOverconstrainedError(
  message: string,
  constraint: string,
): Error {
  const OverconstrainedErrorConstructor = (
    globalThis as unknown as {
      OverconstrainedError?: new (
        constraint: string,
        message?: string,
      ) => Error;
    }
  ).OverconstrainedError;

  if (typeof OverconstrainedErrorConstructor === "function") {
    const native = new OverconstrainedErrorConstructor(constraint, message);
    // happy-dom exposes the name but builds something Event-shaped from it,
    // with neither `name` nor `constraint`. Only trust it if it answers.
    if (looksOverconstrained(native)) {
      return native;
    }
  }

  const error = new DOMException(message, "OverconstrainedError");
  Object.defineProperty(error, "constraint", {
    value: constraint,
    writable: false,
    configurable: true,
    enumerable: true,
  });
  return error;
}
