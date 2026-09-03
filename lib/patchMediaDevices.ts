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
  if (typeof EventTarget === "undefined") {
    return undefined;
  }

  const globals = globalThis as unknown as Record<string, unknown>;

  class SyntheticMediaDevices extends EventTarget {}
  globals.MediaDevices = SyntheticMediaDevices;

  // Node grew a global `navigator` only in v21, and this package supports
  // older ones — so there may be nothing to hang `mediaDevices` off yet.
  const inventedNavigator = typeof navigator === "undefined";
  if (inventedNavigator) {
    globals.navigator = {};
  }

  const previous = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  Object.defineProperty(navigator, "mediaDevices", {
    value: new SyntheticMediaDevices(),
    configurable: true,
    writable: true,
  });

  return () => {
    delete globals.MediaDevices;

    // A navigator we invented goes entirely; one we found keeps whatever it had.
    if (inventedNavigator) {
      delete globals.navigator;
      return;
    }
    if (previous) {
      Object.defineProperty(navigator, "mediaDevices", previous);
    } else {
      Reflect.deleteProperty(navigator as unknown as object, "mediaDevices");
    }
  };
}

/**
 * Ownership of the invented globals, which are process-wide while each patcher
 * is not.
 *
 * `createMediaMock()` exists so tests can hold independent instances, so two
 * can be mocking at once. The first to arrive invents the globals and the last
 * to leave takes them away — otherwise the first to unmock would delete a
 * `navigator` the second is still using.
 */
let invented: { undo: VoidFunction; holders: number } | undefined;

/**
 * Claims a share of the invented globals, creating them if this is the first
 * claim. The returned release is idempotent.
 */
function acquireMediaDevices(): VoidFunction | undefined {
  if (!invented) {
    const undo = synthesizeMediaDevices();
    if (!undo) {
      return undefined;
    }
    invented = { undo, holders: 0 };
  }

  invented.holders++;
  let released = false;

  return () => {
    if (released || !invented) {
      return;
    }
    released = true;
    invented.holders--;

    if (invented.holders === 0) {
      invented.undo();
      invented = undefined;
    }
  };
}

/**
 * Holds the native implementations while mocks are installed.
 */
export class MediaDevicesPatcher {
  private readonly originals = new Map<PatchableMethod, AnyFn>();

  /** This patcher's share of an invented `MediaDevices`, if it took one. */
  private releaseSynthesis: VoidFunction | undefined;

  /**
   * Whether the mock can be installed here: either the environment has a real
   * `MediaDevices`, or it has enough for one to be synthesized.
   */
  static isSupported(): boolean {
    return (
      typeof MediaDevices !== "undefined" || typeof EventTarget !== "undefined"
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
    // `invented` covers the case where another patcher already supplied the
    // globals: this one must take a share too, or the other's unmock would pull
    // them out from under it.
    if (typeof MediaDevices === "undefined" || invented) {
      this.releaseSynthesis ??= acquireMediaDevices();
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

    // A synthesized MediaDevices is ours to let go of; a native one is not.
    this.releaseSynthesis?.();
    this.releaseSynthesis = undefined;
  }
}
