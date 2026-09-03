/**
 * Pure helpers for reading values out of `MediaStreamConstraints`.
 *
 * A constrainable value can arrive as a bare value or as an object with
 * `exact` / `ideal` / `min` / `max` members (and, for DOMString constraints,
 * arrays of candidates). Each accessor below shares one unwrapping
 * implementation and only differs in which keys it consults, in which order.
 *
 * No DOM access: this module is unit-tested in node.
 */

/** Keys of a constrainable object, in the order a caller wants them consulted. */
type ConstraintKey = "exact" | "ideal" | "min" | "max";

const DEFAULT_FRAME_RATE = 30;
const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 480;

/**
 * The video half of the constraints, or an empty object when video was
 * requested as a bare boolean (or not at all).
 */
export function videoConstraints(
  constraints: MediaStreamConstraints,
): MediaTrackConstraints {
  return typeof constraints.video === "object" && constraints.video !== null
    ? constraints.video
    : {};
}

/**
 * The audio half of the constraints, or an empty object when audio was
 * requested as a bare boolean (or not at all).
 */
export function audioConstraints(
  constraints: MediaStreamConstraints,
): MediaTrackConstraints {
  return typeof constraints.audio === "object" && constraints.audio !== null
    ? constraints.audio
    : {};
}

/**
 * Whether a camera was asked for. `false` and an absent member both mean no.
 */
export function isVideoRequested(constraints: MediaStreamConstraints): boolean {
  return constraints.video != null && constraints.video !== false;
}

/**
 * Whether a microphone was asked for. `false` and an absent member both mean no.
 */
export function isAudioRequested(constraints: MediaStreamConstraints): boolean {
  return constraints.audio != null && constraints.audio !== false;
}

/**
 * Unwraps a numeric constrainable value, consulting `keys` in order.
 */
function pickNumber(
  constraint: unknown,
  keys: readonly ConstraintKey[],
  fallback: number,
): number {
  if (typeof constraint === "number") {
    return constraint;
  }
  if (constraint && typeof constraint === "object") {
    const candidates = constraint as Record<string, unknown>;
    for (const key of keys) {
      const value = candidates[key];
      if (typeof value === "number") {
        return value;
      }
    }
  }
  return fallback;
}

/**
 * Unwraps a string constrainable value, consulting `keys` in order. A key whose
 * value is an array contributes its first entry, matching how browsers treat a
 * list of candidates.
 */
function pickString(
  constraint: unknown,
  keys: readonly ConstraintKey[],
): string | null {
  if (typeof constraint === "string") {
    return constraint;
  }
  if (constraint && typeof constraint === "object") {
    const candidates = constraint as Record<string, unknown>;
    for (const key of keys) {
      const value = candidates[key];
      if (typeof value === "string") {
        return value;
      }
      if (Array.isArray(value) && typeof value[0] === "string") {
        return value[0];
      }
    }
  }
  return null;
}

/**
 * Frames per second to drive the canvas capture with.
 *
 * `exact` wins over `ideal`: a caller asking for exactly 25fps should not get 30.
 */
export function extractFrameRate(constraints: MediaStreamConstraints): number {
  return pickNumber(
    videoConstraints(constraints).frameRate,
    ["exact", "ideal", "max"],
    DEFAULT_FRAME_RATE,
  );
}

/**
 * The requested frame size, before it is matched against what the emulated
 * device can actually produce.
 *
 * `ideal` wins over `exact` here (unlike frame rate) because the requested size
 * is only a target: it is subsequently snapped to a supported resolution.
 */
export function extractRequestedSize(constraints: MediaStreamConstraints): {
  width: number;
  height: number;
} {
  const video = videoConstraints(constraints);
  return {
    width: pickNumber(video.width, ["ideal", "exact", "max"], DEFAULT_WIDTH),
    height: pickNumber(video.height, ["ideal", "exact", "max"], DEFAULT_HEIGHT),
  };
}

/**
 * Requested camera orientation ("user" / "environment"), or null when
 * unspecified.
 */
export function extractFacingMode(
  constraints: MediaStreamConstraints,
): string | null {
  return pickString(videoConstraints(constraints).facingMode, [
    "ideal",
    "exact",
  ]);
}

/**
 * Requested device id, or null when unspecified.
 *
 * `exact` wins over `ideal`: `deviceId: { exact }` is how callers pin a specific
 * camera, so it must not be overridden by an `ideal` hint.
 */
export function extractDeviceId(
  constraints: MediaStreamConstraints,
): string | null {
  return pickString(videoConstraints(constraints).deviceId, ["exact", "ideal"]);
}

/**
 * Requested microphone id, or null when unspecified.
 */
export function extractAudioDeviceId(
  constraints: MediaStreamConstraints,
): string | null {
  return pickString(audioConstraints(constraints).deviceId, ["exact", "ideal"]);
}

/**
 * The mandatory bounds of a numeric constrainable value.
 *
 * `exact`, `min` and `max` are mandatory in `getUserMedia` — a request the
 * device cannot meet is refused. `ideal` and a bare value are advisory, so
 * neither appears here.
 */
export interface ConstraintBounds {
  exact?: number;
  min?: number;
  max?: number;
}

/** @see ConstraintBounds */
export function extractBounds(constraint: unknown): ConstraintBounds {
  if (constraint === null || typeof constraint !== "object") {
    return {};
  }

  const candidates = constraint as Record<string, unknown>;
  const bounds: ConstraintBounds = {};
  for (const key of ["exact", "min", "max"] as const) {
    const value = candidates[key];
    if (typeof value === "number") {
      bounds[key] = value;
    }
  }
  return bounds;
}

/**
 * The `exact` candidates of a string constrainable, which alone are mandatory.
 * Returns null when none was given; a browser accepts any one of the list.
 */
export function extractExactStrings(constraint: unknown): string[] | null {
  if (constraint === null || typeof constraint !== "object") {
    return null;
  }

  const value = (constraint as Record<string, unknown>).exact;
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    const strings = value.filter(
      (entry): entry is string => typeof entry === "string",
    );
    return strings.length > 0 ? strings : null;
  }
  return null;
}
