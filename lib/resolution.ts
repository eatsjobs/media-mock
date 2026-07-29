import { extractRequestedSize } from "./constraints";

/**
 * Picking which resolution a mocked camera reports, given what was requested and
 * what the emulated device supports.
 *
 * No DOM access — orientation is passed in rather than read from `window`, so
 * this module is unit-tested in node.
 */

export interface Resolution {
  width: number;
  height: number;
}

/** Used when a device config carries no resolutions at all. */
const ULTIMATE_FALLBACK: Resolution = { width: 640, height: 480 };

function swap({ width, height }: Resolution): Resolution {
  return { width: height, height: width };
}

function isLandscape({ width, height }: Resolution): boolean {
  return width > height;
}

/**
 * Orients a resolution for the current device orientation: a landscape entry is
 * swapped when the device is held in portrait.
 */
function orient(resolution: Resolution, isPortrait: boolean): Resolution {
  return isPortrait && isLandscape(resolution) ? swap(resolution) : resolution;
}

/**
 * Exact match on the requested dimensions, in either orientation.
 */
function findExactMatch(
  available: readonly Resolution[],
  requested: Resolution,
  isPortrait: boolean,
): Resolution | undefined {
  const direct = available.find(
    (res) => res.width === requested.width && res.height === requested.height,
  );
  if (direct) {
    return orient(direct, isPortrait);
  }

  // A portrait request can be satisfied by the equivalent landscape entry.
  if (isPortrait) {
    const swappable = available.find(
      (res) => res.width === requested.height && res.height === requested.width,
    );
    if (swappable) {
      return swap(swappable);
    }
  }

  return undefined;
}

/**
 * Closest available resolution, weighting aspect-ratio distance above pixel
 * count so a 16:9 request never snaps to a 4:3 mode just because it is nearer
 * in total pixels.
 */
function findBestFit(
  available: readonly Resolution[],
  requested: Resolution,
  isPortrait: boolean,
): Resolution | undefined {
  const targetAspectRatio = requested.width / requested.height;
  const targetPixels = requested.width * requested.height;

  let best: { resolution: Resolution; score: number } | undefined;

  for (const candidate of available) {
    const oriented = orient(candidate, isPortrait);
    const aspectDiff = Math.abs(
      oriented.width / oriented.height - targetAspectRatio,
    );
    const sizeDiff =
      Math.abs(oriented.width * oriented.height - targetPixels) / targetPixels;
    const score = aspectDiff * 2 + sizeDiff;

    if (!best || score < best.score) {
      best = { resolution: oriented, score };
    }
  }

  return best?.resolution;
}

/**
 * Last resort when the device lists no resolutions.
 */
function fallback(isPortrait: boolean): Resolution {
  return orient(ULTIMATE_FALLBACK, isPortrait);
}

/**
 * Chooses the resolution a mocked track should report.
 *
 * Never mutates `available`, and always returns a fresh object.
 */
export function matchResolution({
  requested,
  available,
  isPortrait,
}: {
  requested: Resolution;
  available: readonly Resolution[];
  isPortrait: boolean;
}): Resolution {
  const matched =
    findExactMatch(available, requested, isPortrait) ??
    findBestFit(available, requested, isPortrait) ??
    fallback(isPortrait);

  return { ...matched };
}

/**
 * Convenience composition of {@link extractRequestedSize} and
 * {@link matchResolution} for callers holding raw constraints.
 */
export function resolveResolution(
  constraints: MediaStreamConstraints,
  available: readonly Resolution[],
  isPortrait: boolean,
): Resolution {
  return matchResolution({
    requested: extractRequestedSize(constraints),
    available,
    isPortrait,
  });
}
