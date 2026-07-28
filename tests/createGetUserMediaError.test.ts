import { afterEach, describe, expect, it } from "vitest";
import { createGetUserMediaError } from "../lib/createGetUserMediaError";

describe("createGetUserMediaError", () => {
  const globalWithOverconstrained = globalThis as unknown as {
    OverconstrainedError?: unknown;
  };
  const nativeOverconstrainedError =
    globalWithOverconstrained.OverconstrainedError;

  afterEach(() => {
    if (nativeOverconstrainedError === undefined) {
      delete globalWithOverconstrained.OverconstrainedError;
    } else {
      globalWithOverconstrained.OverconstrainedError =
        nativeOverconstrainedError;
    }
  });

  it("should fall back to a DOMException with a constraint property when the browser has no OverconstrainedError constructor", () => {
    // Chromium provides the constructor; CI runs Chromium only, so remove it to
    // exercise the WebKit/Firefox path everywhere.
    delete globalWithOverconstrained.OverconstrainedError;

    const error = createGetUserMediaError("OverconstrainedError", {
      constraint: "height",
      message: "cannot satisfy height",
    });

    expect(error).toBeInstanceOf(DOMException);
    expect(error.name).toBe("OverconstrainedError");
    expect(error.message).toBe("cannot satisfy height");
    expect((error as { constraint?: string }).constraint).toBe("height");
  });
});
