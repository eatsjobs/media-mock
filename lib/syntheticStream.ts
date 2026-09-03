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

/** An object inheriting from `globalName`'s prototype where one exists. */
function inheritingFrom(globalName: string): Record<string, unknown> {
  return Object.create(nativePrototype(globalName) ?? Object.prototype);
}

/**
 * Installs `members` as own properties.
 *
 * Not `Object.assign`: an adopted prototype may declare a member as a
 * getter with no setter — happy-dom's `MediaStreamTrack.prototype` does
 * exactly that for `kind` — and plain assignment through it throws.
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
  const events = new EventTarget();
  const track = inheritingFrom("MediaStreamTrack");

  const stop = (): void => {
    if (track.readyState === "ended") {
      return;
    }
    track.readyState = "ended";
    events.dispatchEvent(new Event("ended"));
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
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
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
  const events = new EventTarget();
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
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  });

  Object.defineProperty(stream, "active", {
    get: () => held.some((track) => track.readyState === "live"),
    enumerable: true,
    configurable: true,
  });

  return stream as unknown as MediaStream;
}
