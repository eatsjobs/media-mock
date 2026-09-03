/**
 * Stand-ins for `MediaStream` and `MediaStreamTrack`.
 *
 * A DOM emulator exposes these names without working implementations:
 * happy-dom's `MediaStreamTrack` cannot be constructed at all ("Illegal
 * constructor") and its `MediaStream` drops the tracks it is handed. Frameless
 * mode therefore builds its own, shaped like the real interfaces so a consumer
 * reading a track cannot tell the difference — right up until it asks for
 * pixels, which no emulator can provide anyway.
 *
 * Each object is built on the real interface's prototype where the environment
 * has one, so `instanceof MediaStream` holds. That is done per object rather
 * than by mutating a shared class prototype: the environment's globals are not
 * ours to rewrite, and one shared mutation would chain every later object to
 * whichever interface happened to exist at the first call. Everything an object
 * needs is its own property, so nothing inherited can shadow it.
 *
 * Each object is also a real `EventTarget`, so an event dispatched on it
 * reports it as `event.target` — which is how a consumer works out which track
 * ended.
 *
 * No canvas, no codecs: usable wherever `EventTarget` exists.
 */

/** The prototype of a global interface, when the environment defines one. */
function nativePrototype(globalName: string): object | null {
  const nativeInterface = (globalThis as unknown as Record<string, unknown>)[
    globalName
  ];

  if (typeof nativeInterface !== "function") {
    return null;
  }
  return (nativeInterface as { prototype?: object }).prototype ?? null;
}

/** Whether `prototype` already inherits EventTarget's behaviour. */
function chainsToEventTarget(prototype: object): boolean {
  for (
    let link: object | null = prototype;
    link !== null;
    link = Object.getPrototypeOf(link)
  ) {
    if (link === EventTarget.prototype) {
      return true;
    }
  }
  return false;
}

/**
 * An object wearing `globalName`'s prototype where one exists.
 *
 * A real `MediaStreamTrack.prototype` inherits from `EventTarget.prototype`, so
 * there the object can be a genuine EventTarget wearing that prototype: events
 * dispatched on it report it as `event.target`, and both `instanceof` checks
 * answer. The runtime brand-checks against the prototype chain, so this only
 * works when the chain reaches EventTarget.prototype — which is also why the
 * fallback is `EventTarget.prototype` rather than `Object.prototype`.
 *
 * An emulator's prototype does not inherit from EventTarget (happy-dom's
 * carries only a constructor), so there the object is a plain one and events go
 * through {@link eventMethodsFor}'s stand-in instead.
 */
function inheritingFrom(globalName: string): Record<string, unknown> {
  const prototype = nativePrototype(globalName) ?? EventTarget.prototype;

  if (chainsToEventTarget(prototype)) {
    // A real EventTarget, re-prototyped onto the interface being impersonated.
    // The brand survives because the new chain still reaches
    // `EventTarget.prototype`, which is what the runtime checks.
    const object = new EventTarget();
    Object.setPrototypeOf(object, prototype);
    return object as unknown as Record<string, unknown>;
  }

  return Object.create(prototype);
}

/**
 * Event plumbing for `target`.
 *
 * A genuine EventTarget uses its own methods, unbound so that calling
 * `track.addEventListener(...)` acts on the track. Anything else dispatches
 * through an EventTarget of ours, with the event retargeted first — otherwise
 * every listener would see that internal object as `event.target` rather than
 * the track that ended.
 */
function eventMethodsFor(target: object): Record<string, unknown> {
  if (target instanceof EventTarget) {
    return {
      addEventListener: EventTarget.prototype.addEventListener,
      removeEventListener: EventTarget.prototype.removeEventListener,
      dispatchEvent: EventTarget.prototype.dispatchEvent,
    };
  }

  const events = new EventTarget();
  return {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: (event: Event): boolean => {
      // An own property shadows Event.prototype's getter, which the dispatch
      // below would otherwise point at `events`.
      for (const name of ["target", "currentTarget"]) {
        Object.defineProperty(event, name, {
          value: target,
          configurable: true,
          enumerable: true,
        });
      }
      return events.dispatchEvent(event);
    },
  };
}

/**
 * Installs `members` as own properties.
 *
 * Not `Object.assign`: an adopted prototype may declare a member as a getter
 * with no setter — happy-dom's `MediaStreamTrack.prototype` does exactly that
 * for `kind` — and plain assignment through it throws.
 */
function defineOwn(
  target: Record<string, unknown>,
  members: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(members)) {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
}

function randomId(prefix: string): string {
  return `media-mock-${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * A live video track carrying no media.
 *
 * Identity, settings and capabilities are filled in afterwards by
 * `decorateVideoTrack`, exactly as they are for a real capture track.
 */
export function createSyntheticVideoTrack(): MediaStreamTrack {
  const track = inheritingFrom("MediaStreamTrack");

  const stop = (): void => {
    if (track.readyState === "ended") {
      return;
    }
    track.readyState = "ended";
    (track as unknown as EventTarget).dispatchEvent(new Event("ended"));
  };

  defineOwn(track, {
    kind: "video",
    id: randomId("video"),
    label: "",
    enabled: true,
    muted: false,
    readyState: "live",
    contentHint: "",
    getSettings: (): MediaTrackSettings => ({}),
    getCapabilities: (): MediaTrackCapabilities => ({}),
    getConstraints: (): MediaTrackConstraints => ({}),
    applyConstraints: (): Promise<void> => Promise.resolve(),
    // A frameless track has no media to fork, so a clone is the same track:
    // stopping either ends both.
    clone: (): unknown => track,
    stop,
    ...eventMethodsFor(track),
  });

  return track as unknown as MediaStreamTrack;
}

/**
 * A stream that actually holds the tracks it is given, for environments whose
 * own `MediaStream` does not.
 */
export function createSyntheticStream(
  tracks: readonly MediaStreamTrack[],
): MediaStream {
  const held = [...tracks];
  const stream = inheritingFrom("MediaStream");

  defineOwn(stream, {
    id: randomId("stream"),
    getTracks: (): MediaStreamTrack[] => [...held],
    getVideoTracks: (): MediaStreamTrack[] =>
      held.filter((track) => track.kind === "video"),
    getAudioTracks: (): MediaStreamTrack[] =>
      held.filter((track) => track.kind === "audio"),
    getTrackById: (id: string): MediaStreamTrack | null =>
      held.find((track) => track.id === id) ?? null,
    addTrack: (track: MediaStreamTrack): void => {
      if (!held.includes(track)) {
        held.push(track);
      }
    },
    removeTrack: (track: MediaStreamTrack): void => {
      const index = held.indexOf(track);
      if (index !== -1) {
        held.splice(index, 1);
      }
    },
    clone: (): MediaStream => createSyntheticStream(held),
    ...eventMethodsFor(stream),
  });

  Object.defineProperty(stream, "active", {
    get: () => held.some((track) => track.readyState === "live"),
    enumerable: true,
    configurable: true,
  });

  return stream as unknown as MediaStream;
}
