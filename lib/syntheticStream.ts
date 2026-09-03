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
 * The prototype of the real interface is adopted where one exists, so
 * `instanceof MediaStream` still holds.
 *
 * No canvas, no codecs: usable wherever `EventTarget` exists.
 */

/** A track that reports itself as live but carries no media. */
class SyntheticMediaStreamTrack extends EventTarget {
  readonly kind: string;
  id: string;
  label = "";
  enabled = true;
  readonly muted = false;
  readyState: "live" | "ended" = "live";
  contentHint = "";

  private readonly settings: MediaTrackSettings;

  constructor(kind: "video" | "audio") {
    super();
    this.kind = kind;
    this.id = `media-mock-${kind}-${Math.random().toString(36).slice(2, 10)}`;
    this.settings = {};
  }

  getSettings(): MediaTrackSettings {
    return { ...this.settings };
  }

  getCapabilities(): MediaTrackCapabilities {
    return {};
  }

  getConstraints(): MediaTrackConstraints {
    return {};
  }

  applyConstraints(): Promise<void> {
    return Promise.resolve();
  }

  clone(): SyntheticMediaStreamTrack {
    return this;
  }

  stop(): void {
    if (this.readyState === "ended") {
      return;
    }
    this.readyState = "ended";
    this.dispatchEvent(new Event("ended"));
  }
}

/** A stream that actually holds the tracks it is given. */
class SyntheticMediaStream extends EventTarget {
  readonly id = `media-mock-stream-${Math.random().toString(36).slice(2, 10)}`;

  private readonly tracks: MediaStreamTrack[];

  constructor(tracks: MediaStreamTrack[]) {
    super();
    this.tracks = [...tracks];
  }

  get active(): boolean {
    return this.tracks.some((track) => track.readyState === "live");
  }

  getTracks(): MediaStreamTrack[] {
    return [...this.tracks];
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === "video");
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === "audio");
  }

  getTrackById(id: string): MediaStreamTrack | null {
    return this.tracks.find((track) => track.id === id) ?? null;
  }

  addTrack(track: MediaStreamTrack): void {
    if (!this.tracks.includes(track)) {
      this.tracks.push(track);
    }
  }

  removeTrack(track: MediaStreamTrack): void {
    const index = this.tracks.indexOf(track);
    if (index !== -1) {
      this.tracks.splice(index, 1);
    }
  }

  clone(): SyntheticMediaStream {
    return new SyntheticMediaStream(this.tracks);
  }
}

/**
 * Adopts the real interface's prototype where the environment has one, so
 * `instanceof` still answers correctly. The emulator's prototypes carry no
 * working methods, so nothing of ours is shadowed.
 */
function adoptPrototype(value: object, globalName: string): void {
  const nativeInterface = (globalThis as unknown as Record<string, unknown>)[
    globalName
  ];

  if (typeof nativeInterface !== "function") {
    return;
  }
  const prototype = (nativeInterface as { prototype?: object }).prototype;
  if (!prototype) {
    return;
  }

  // Keep our own methods reachable by inserting the real prototype beneath ours.
  const own = Object.getPrototypeOf(value);
  if (Object.getPrototypeOf(own) === Object.prototype) {
    Object.setPrototypeOf(own, prototype);
  }
}

/**
 * A live video track that carries the emulated camera's identity but no frames.
 */
export function createSyntheticVideoTrack(): MediaStreamTrack {
  const track = new SyntheticMediaStreamTrack("video");
  adoptPrototype(track, "MediaStreamTrack");
  return track as unknown as MediaStreamTrack;
}

/**
 * A stream holding `tracks`, for environments whose own `MediaStream` cannot.
 */
export function createSyntheticStream(tracks: MediaStreamTrack[]): MediaStream {
  const stream = new SyntheticMediaStream(tracks);
  adoptPrototype(stream, "MediaStream");
  return stream as unknown as MediaStream;
}
