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
 * The one installed `query`, shared by every patcher.
 *
 * `createMediaMock()` instances are independent, so two can be mocking at
 * once and leave in any order. A single mock function stays installed while
 * any patcher holds it, answers for the one that installed last, and the
 * native implementation (or its absence) comes back only when the last one
 * leaves — the same ownership `patchMediaDevices.ts` keeps for the globals
 * it invents.
 */
interface Installation {
  /** The native query from `Permissions.prototype`, if there was one. */
  native: QueryFn | undefined;
  patchedPrototype: boolean;
  /** What `navigator.permissions` was before we supplied one, if we did. */
  synthesized: { previous: PropertyDescriptor | undefined } | undefined;
  /** Active patchers, oldest first; the last one answers. */
  holders: PermissionsPatcher[];
}

let installation: Installation | undefined;

function createSharedQuery(): QueryFn {
  return async function query(
    this: Permissions,
    descriptor: PermissionDescriptor,
  ): Promise<PermissionStatus> {
    const name = descriptor?.name;
    const holders = installation?.holders ?? [];
    const active = holders[holders.length - 1];

    if (isMediaPermissionName(name) && active) {
      return active.createStatus(name);
    }

    if (installation?.native) {
      return installation.native.call(this, descriptor);
    }

    throw new TypeError(
      `Failed to execute 'query' on 'Permissions': The provided value '${String(name)}' is not a valid enum value of type PermissionName.`,
    );
  };
}

/** Installs the shared query. Returns undefined where there is nowhere to. */
function installSharedQuery(): Installation | undefined {
  const query = createSharedQuery();

  if (typeof Permissions !== "undefined") {
    const proto = Permissions.prototype as unknown as { query: QueryFn };
    const native = proto.query;
    // Wear the native name and arity, as patchMediaDevices does.
    Object.defineProperty(query, "name", {
      value: native?.name ?? "query",
      configurable: true,
    });
    Object.defineProperty(query, "length", {
      value: native?.length ?? 1,
      configurable: true,
    });
    proto.query = query;
    return {
      native,
      patchedPrototype: true,
      synthesized: undefined,
      holders: [],
    };
  }

  // MediaDevicesPatcher invents `navigator` where it is missing; with no
  // navigator at all there is nothing to hang `permissions` off.
  if (typeof navigator === "undefined") {
    return undefined;
  }

  const previous = Object.getOwnPropertyDescriptor(navigator, "permissions");
  Object.defineProperty(navigator, "permissions", {
    value: { query },
    configurable: true,
    writable: true,
  });
  return {
    native: undefined,
    patchedPrototype: false,
    synthesized: { previous },
    holders: [],
  };
}

function uninstallSharedQuery(current: Installation): void {
  if (current.patchedPrototype) {
    (Permissions.prototype as unknown as { query: QueryFn | undefined }).query =
      current.native;
  }
  if (current.synthesized && typeof navigator !== "undefined") {
    const { previous } = current.synthesized;
    if (previous) {
      Object.defineProperty(navigator, "permissions", previous);
    } else {
      Reflect.deleteProperty(navigator as unknown as object, "permissions");
    }
  }
}

/**
 * One instance's share of the mocked `query`: how it reads state, and every
 * status object it handed out, so state changes can reach them.
 */
export class PermissionsPatcher {
  private read: StateReader | undefined;

  private readonly statuses = new Map<
    MediaPermissionName,
    Set<MockPermissionStatus>
  >();

  get installed(): boolean {
    return this.read !== undefined;
  }

  /**
   * Installs the mocked `query`, or takes a share of the one already there.
   * `read` is consulted on every call and every notification, so it always
   * reports the current state. Installing twice keeps the first share.
   */
  install(read: StateReader): void {
    this.read = read;

    if (!installation) {
      installation = installSharedQuery();
    }
    if (installation && !installation.holders.includes(this)) {
      installation.holders.push(this);
    }
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

  /**
   * Gives up this share. The native `query` (or the absence of one) comes
   * back once no patcher holds a share.
   */
  restore(): void {
    if (installation) {
      installation.holders = installation.holders.filter(
        (holder) => holder !== this,
      );
      if (installation.holders.length === 0) {
        uninstallSharedQuery(installation);
        installation = undefined;
      }
    }

    this.read = undefined;
    this.statuses.clear();
  }

  /** A status object for `name`, kept so later changes reach it. */
  createStatus(name: MediaPermissionName): PermissionStatus {
    const status = new MockPermissionStatus(
      name,
      this.read?.(name) ?? "granted",
    );
    let live = this.statuses.get(name);
    if (!live) {
      live = new Set();
      this.statuses.set(name, live);
    }
    live.add(status);
    return status as unknown as PermissionStatus;
  }
}
