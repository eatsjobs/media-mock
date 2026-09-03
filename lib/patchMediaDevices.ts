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
 * Installs a stand-in `MediaDevices` where the environment has none.
 *
 * A DOM emulator (happy-dom, jsdom) has no media stack at all, so there is no
 * prototype to patch and `navigator.mediaDevices` is undefined. Supplying both
 * is what lets the device half of the library — enumeration, capabilities,
 * constraint refusal, error simulation — work outside a real browser.
 *
 * @returns an undo, or undefined where even that is impossible.
 */
function synthesizeMediaDevices(): VoidFunction | undefined {
  if (typeof EventTarget === "undefined" || typeof navigator === "undefined") {
    return undefined;
  }

  class SyntheticMediaDevices extends EventTarget {}
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.MediaDevices = SyntheticMediaDevices;

  const previous = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  Object.defineProperty(navigator, "mediaDevices", {
    value: new SyntheticMediaDevices(),
    configurable: true,
    writable: true,
  });

  return () => {
    delete globals.MediaDevices;
    if (previous) {
      Object.defineProperty(navigator, "mediaDevices", previous);
    } else {
      Reflect.deleteProperty(navigator as unknown as object, "mediaDevices");
    }
  };
}

/**
 * Holds the native implementations while mocks are installed.
 */
export class MediaDevicesPatcher {
  private readonly originals = new Map<PatchableMethod, AnyFn>();

  /** Undo for a `MediaDevices` this patcher had to invent. */
  private undoSynthesis: VoidFunction | undefined;

  /**
   * Whether the mock can be installed here: either the environment has a real
   * `MediaDevices`, or it has enough for one to be synthesized.
   */
  static isSupported(): boolean {
    return (
      typeof MediaDevices !== "undefined" ||
      (typeof EventTarget !== "undefined" && typeof navigator !== "undefined")
    );
  }

  /** Number of methods currently patched. */
  get patchedCount(): number {
    return this.originals.size;
  }

  /**
   * Installs `mockFn` in place of `method`.
   *
   * The native implementation is captured only on the first patch of a given
   * method: on a repeated `mock()` with no `unmock()` in between the prototype
   * already holds a mock, and saving that would lose the native permanently.
   */
  patch(method: PatchableMethod, mockFn: AnyFn): void {
    if (typeof MediaDevices === "undefined") {
      this.undoSynthesis ??= synthesizeMediaDevices();
    }
    if (typeof MediaDevices === "undefined") {
      return;
    }

    const proto = MediaDevices.prototype as unknown as Record<string, AnyFn>;

    if (!this.originals.has(method)) {
      this.originals.set(method, proto[method]);
    }
    const original = this.originals.get(method);

    // Wear the native name and arity. Feature detection and wrappers that
    // forward arguments by `length` read both, and an anonymous zero-name
    // function is an obvious tell that the API has been replaced.
    Object.defineProperty(mockFn, "name", {
      value: original?.name ?? method,
      configurable: true,
    });
    Object.defineProperty(mockFn, "length", {
      value: original?.length ?? 0,
      configurable: true,
    });

    proto[method] = mockFn;
  }

  /**
   * Restores every patched method to its native implementation.
   */
  restoreAll(): void {
    for (const [method, original] of this.originals) {
      (MediaDevices.prototype as unknown as Record<string, AnyFn>)[method] =
        original;
    }
    this.originals.clear();

    // A synthesized MediaDevices is ours to remove; a native one is not.
    this.undoSynthesis?.();
    this.undoSynthesis = undefined;
  }
}
