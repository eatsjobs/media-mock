/**
 * Replacing `navigator.permissions.query` for the camera and microphone, and
 * putting it back.
 *
 * Like `patchMediaDevices.ts`, the prototype is patched where there is one
 * (real browsers, happy-dom), so the change holds even where the instance is
 * read-only. Where there is none (jsdom), a minimal `navigator.permissions`
 * is supplied and taken away again on restore.
 */

import {
  MEDIA_PERMISSION_NAMES,
  type MediaPermissionName,
} from "./permissions";

type QueryFn = (
  this: Permissions,
  descriptor: PermissionDescriptor,
) => Promise<PermissionStatus>;

type StateReader = (name: MediaPermissionName) => PermissionState;

function isMediaPermissionName(name: unknown): name is MediaPermissionName {
  return MEDIA_PERMISSION_NAMES.includes(name as MediaPermissionName);
}

type ChangeHandler = ((this: PermissionStatus, event: Event) => unknown) | null;

/**
 * Stands in for `PermissionStatus`, whose constructor browsers refuse to
 * call. Carries what apps read: `name`, `state`, `onchange` and `change`
 * events.
 *
 * `onchange` is an accessor on the prototype, as on the real interface, and
 * never an own property: happy-dom calls an *own* `on<type>` property of an
 * EventTarget subclass by itself, which would run the handler twice.
 */
class MockPermissionStatus extends EventTarget {
  #onchange: ChangeHandler = null;

  constructor(
    public readonly name: MediaPermissionName,
    public state: PermissionState,
  ) {
    super();
    // An event handler attribute runs as a listener registered up front.
    this.addEventListener("change", (event) => {
      this.#onchange?.call(this as unknown as PermissionStatus, event);
    });
  }

  get onchange(): ChangeHandler {
    return this.#onchange;
  }

  set onchange(handler: ChangeHandler) {
    this.#onchange = typeof handler === "function" ? handler : null;
  }
}

/**
 * Holds the native `query` while the mock is installed, and every status
 * object handed out, so state changes can reach them.
 */
export class PermissionsPatcher {
  private read: StateReader | undefined;

  /** The native query, once captured from `Permissions.prototype`. */
  private original: QueryFn | undefined;
  private patchedPrototype = false;

  /** What `navigator.permissions` was before we supplied one, if we did. */
  private synthesized: { previous: PropertyDescriptor | undefined } | undefined;

  private readonly statuses = new Map<
    MediaPermissionName,
    Set<MockPermissionStatus>
  >();

  get installed(): boolean {
    return this.read !== undefined;
  }

  /**
   * Installs the mocked `query`. `read` is consulted on every call and every
   * notification, so it always reports the current state.
   */
  install(read: StateReader): void {
    this.read = read;

    if (this.patchedPrototype || this.synthesized) {
      // Already installed: re-capturing now would save our own mock as the
      // "original" and lose the native for good.
      return;
    }

    const query = this.createQuery();

    if (typeof Permissions !== "undefined") {
      const proto = Permissions.prototype as unknown as { query: QueryFn };
      this.original = proto.query;
      Object.defineProperty(query, "name", {
        value: this.original?.name ?? "query",
        configurable: true,
      });
      Object.defineProperty(query, "length", {
        value: this.original?.length ?? 1,
        configurable: true,
      });
      proto.query = query;
      this.patchedPrototype = true;
      return;
    }

    // MediaDevicesPatcher invents `navigator` where it is missing; with no
    // navigator at all there is nothing to hang `permissions` off.
    if (typeof navigator === "undefined") {
      return;
    }

    this.synthesized = {
      previous: Object.getOwnPropertyDescriptor(navigator, "permissions"),
    };
    Object.defineProperty(navigator, "permissions", {
      value: { query },
      configurable: true,
      writable: true,
    });
  }

  /**
   * Queues a task that brings every live status for `name` up to date and
   * fires `change` on those whose state moved. The state is read when the
   * task runs, so several changes in a row produce one event.
   */
  notify(name: MediaPermissionName): void {
    setTimeout(() => {
      const state = this.read?.(name);
      if (state === undefined) {
        return;
      }
      for (const status of this.statuses.get(name) ?? []) {
        if (status.state !== state) {
          status.state = state;
          status.dispatchEvent(new Event("change"));
        }
      }
    }, 0);
  }

  /** Puts the native `query` (or the absence of one) back. */
  restore(): void {
    if (this.patchedPrototype) {
      (
        Permissions.prototype as unknown as { query: QueryFn | undefined }
      ).query = this.original;
    }
    if (this.synthesized && typeof navigator !== "undefined") {
      const { previous } = this.synthesized;
      if (previous) {
        Object.defineProperty(navigator, "permissions", previous);
      } else {
        Reflect.deleteProperty(navigator as unknown as object, "permissions");
      }
    }

    this.patchedPrototype = false;
    this.synthesized = undefined;
    this.original = undefined;
    this.read = undefined;
    this.statuses.clear();
  }

  private createQuery(): QueryFn {
    const patcher = this;

    return async function query(
      this: Permissions,
      descriptor: PermissionDescriptor,
    ): Promise<PermissionStatus> {
      const name = descriptor?.name;

      if (isMediaPermissionName(name) && patcher.read) {
        const status = new MockPermissionStatus(name, patcher.read(name));
        let live = patcher.statuses.get(name);
        if (!live) {
          live = new Set();
          patcher.statuses.set(name, live);
        }
        live.add(status);
        return status as unknown as PermissionStatus;
      }

      if (patcher.original) {
        return patcher.original.call(this, descriptor);
      }

      throw new TypeError(
        `Failed to execute 'query' on 'Permissions': The provided value '${String(name)}' is not a valid enum value of type PermissionName.`,
      );
    };
  }
}
