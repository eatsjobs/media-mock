/**
 * Swapping methods on `MediaDevices.prototype` and putting them back.
 *
 * Patching the prototype rather than the `navigator.mediaDevices` instance is
 * what lets the mock work in browsers where that instance is read-only.
 */

// biome-ignore lint/suspicious/noExplicitAny: patching prototype properties by name requires any
type AnyFn = (...args: any[]) => any;

/** Methods of `navigator.mediaDevices` this library can replace. */
export type PatchableMethod =
  | "getUserMedia"
  | "getSupportedConstraints"
  | "enumerateDevices";

/**
 * Holds the native implementations while mocks are installed.
 */
export class MediaDevicesPatcher {
  private readonly restores = new Map<PatchableMethod, VoidFunction>();

  /** Whether the environment exposes `MediaDevices` at all (jsdom/node do not). */
  static isSupported(): boolean {
    return typeof MediaDevices !== "undefined";
  }

  /** Number of methods currently patched. */
  get patchedCount(): number {
    return this.restores.size;
  }

  /**
   * Installs `mockFn` in place of `method`.
   *
   * The native implementation is captured only on the first patch of a given
   * method: on a repeated `mock()` with no `unmock()` in between the prototype
   * already holds a mock, and saving that would lose the native permanently.
   */
  patch(method: PatchableMethod, mockFn: AnyFn): void {
    if (!MediaDevicesPatcher.isSupported()) {
      return;
    }

    const proto = MediaDevices.prototype as unknown as Record<string, AnyFn>;

    if (!this.restores.has(method)) {
      const original = proto[method];
      this.restores.set(method, () => {
        proto[method] = original;
      });
    }

    proto[method] = mockFn;
  }

  /**
   * Restores every patched method to its native implementation.
   */
  restoreAll(): void {
    for (const restore of this.restores.values()) {
      restore();
    }
    this.restores.clear();
  }
}
