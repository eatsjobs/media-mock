import {
  audioConstraints,
  type ConstraintBounds,
  extractBounds,
  extractExactStrings,
  isAudioRequested,
  isVideoRequested,
  videoConstraints,
} from "./constraints";
import type { MockMediaDeviceInfo } from "./createMediaDeviceInfo";

/**
 * Deciding whether the emulated device can serve a request at all.
 *
 * A real `getUserMedia` refuses what it cannot deliver rather than substituting
 * something else, so a test written against a mock that always succeeds never
 * exercises the caller's failure path.
 *
 * Only mandatory constraints are considered — `exact`, `min` and `max`. `ideal`
 * and bare values are advisory: browsers get as close as they can and never
 * reject over them.
 *
 * No DOM access: unit-tested in node.
 */

/** Numeric video capabilities checked independently of frame size. */
const VIDEO_RANGES = ["frameRate", "aspectRatio"] as const;

/** Numeric audio capabilities worth checking. */
const AUDIO_RANGES = ["channelCount", "sampleRate", "sampleSize"] as const;

/**
 * The name of the first mandatory constraint the device cannot satisfy, or null
 * when the request is serviceable.
 */
export function findUnsatisfiableConstraint({
  constraints,
  videoDevice,
  audioDevice,
}: {
  constraints: MediaStreamConstraints;
  videoDevice: MockMediaDeviceInfo | undefined;
  audioDevice: MockMediaDeviceInfo | undefined;
}): string | null {
  if (isVideoRequested(constraints)) {
    const requested = videoConstraints(constraints);

    const wrongCamera = checkDeviceId(requested, videoDevice);
    if (wrongCamera) {
      return wrongCamera;
    }

    const facingMode = extractExactStrings(requested.facingMode);
    if (facingMode) {
      const supported = videoDevice?.getCapabilities().facingMode;
      const canFace =
        Array.isArray(supported) &&
        facingMode.some((mode) => supported.includes(mode));
      if (!canFace) {
        return "facingMode";
      }
    }

    const badSize = checkFrameSize(requested, videoDevice);
    if (badSize) {
      return badSize;
    }

    const outOfRange = checkRanges(requested, videoDevice, VIDEO_RANGES);
    if (outOfRange) {
      return outOfRange;
    }
  }

  if (isAudioRequested(constraints)) {
    const requested = audioConstraints(constraints);

    const wrongMicrophone = checkDeviceId(requested, audioDevice);
    if (wrongMicrophone) {
      return wrongMicrophone;
    }

    const outOfRange = checkRanges(requested, audioDevice, AUDIO_RANGES);
    if (outOfRange) {
      return outOfRange;
    }
  }

  return null;
}

/**
 * "deviceId" when an exact id was asked for and the device that would serve the
 * request is not one of the candidates.
 */
function checkDeviceId(
  requested: MediaTrackConstraints,
  device: MockMediaDeviceInfo | undefined,
): string | null {
  const wanted = extractExactStrings(requested.deviceId);
  if (!wanted) {
    return null;
  }
  return device && wanted.includes(device.deviceId) ? null : "deviceId";
}

/**
 * Whether the device can produce the requested frame size, in either
 * orientation.
 *
 * A camera declares one width range and one height range, for the sensor held
 * upright. Held the other way it produces the transpose, and browsers serve a
 * portrait request from a landscape sensor without complaint — so a request is
 * refused only when neither orientation fits.
 *
 * Returns the dimension that fails upright, which is the one a caller reading
 * the error would recognise.
 */
function checkFrameSize(
  requested: MediaTrackConstraints,
  device: MockMediaDeviceInfo | undefined,
): string | null {
  const capabilities = device?.getCapabilities();
  const widthRange = capabilities?.width;
  const heightRange = capabilities?.height;
  if (!widthRange && !heightRange) {
    return null;
  }

  const width = extractBounds(requested.width);
  const height = extractBounds(requested.height);

  const upright = !exceeds(width, widthRange) && !exceeds(height, heightRange);
  const rotated = !exceeds(width, heightRange) && !exceeds(height, widthRange);
  if (upright || rotated) {
    return null;
  }

  return exceeds(width, widthRange) ? "width" : "height";
}

/**
 * The first of `names` whose mandatory bounds fall outside what the device
 * declares it can produce. A capability the device does not declare cannot be
 * shown unsatisfiable, so it is skipped.
 */
function checkRanges(
  requested: MediaTrackConstraints,
  device: MockMediaDeviceInfo | undefined,
  names: readonly string[],
): string | null {
  const capabilities = device?.getCapabilities() as
    | Record<string, unknown>
    | undefined;

  for (const name of names) {
    const range = capabilities?.[name] as
      | { min?: number; max?: number }
      | undefined;
    if (!range || typeof range !== "object") {
      continue;
    }

    const bounds = extractBounds((requested as Record<string, unknown>)[name]);
    if (exceeds(bounds, range)) {
      return name;
    }
  }

  return null;
}

/** Whether mandatory `bounds` cannot be met inside the device's `range`. */
function exceeds(
  bounds: ConstraintBounds,
  range: { min?: number; max?: number } | undefined,
): boolean {
  if (!range) {
    return false;
  }

  const min = range.min ?? Number.NEGATIVE_INFINITY;
  const max = range.max ?? Number.POSITIVE_INFINITY;

  if (
    bounds.exact !== undefined &&
    (bounds.exact < min || bounds.exact > max)
  ) {
    return true;
  }
  // A floor above what the device reaches, or a ceiling below it.
  return (
    (bounds.min !== undefined && bounds.min > max) ||
    (bounds.max !== undefined && bounds.max < min)
  );
}
