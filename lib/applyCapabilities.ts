import type { EnhancedMediaTrackCapabilities } from "./createMediaDeviceInfo";

/**
 * Applying the constraints an emulated device advertises it can satisfy.
 *
 * A track from `captureStream()` knows nothing about torch, zoom or white
 * balance, so `applyConstraints({ advanced: [{ torch: true }] })` reaches the
 * browser and is refused — `OverconstrainedError: Unsupported constraint`. Once
 * the mock started reporting the emulated camera's capabilities, that became
 * incoherent: advertising `torch: true` and then rejecting a torch constraint
 * is a combination no real device exhibits.
 *
 * So constraints naming something the device advertises are settled here and
 * recorded in the track's settings, exactly as a camera would. Everything else
 * still belongs to the browser.
 *
 * No DOM access: unit-tested in node.
 */

/** What a constraint request resolves to against a device's capabilities. */
export interface AppliedConstraints {
  /** Values the device can satisfy, to be reported in `getSettings()`. */
  settings: MediaTrackSettings;
  /** What the browser should still be asked for, or null when nothing is left. */
  remainder: MediaTrackConstraints | null;
  /** A basic constraint the device advertises but cannot meet. */
  unsatisfiable: string | null;
}

/**
 * A constrainable value split into its members. `exact`, `min` and `max` are
 * mandatory; `ideal` is a preference the device gets as close to as it can.
 */
interface ConstraintRequest {
  exact?: unknown;
  ideal?: unknown;
  min?: number;
  max?: number;
}

/**
 * Splits a constrainable value into its members. A bare value (or bare list)
 * means `ideal` in a basic constraint set and `exact` inside `advanced`, as the
 * specification says.
 */
function parseConstraint(
  constraint: unknown,
  bare: "exact" | "ideal",
): ConstraintRequest {
  if (
    constraint === null ||
    typeof constraint !== "object" ||
    Array.isArray(constraint)
  ) {
    return { [bare]: constraint };
  }

  const { exact, ideal, min, max } = constraint as Record<string, unknown>;
  return {
    exact,
    ideal,
    min: typeof min === "number" ? min : undefined,
    max: typeof max === "number" ? max : undefined,
  };
}

/** A request with a mandatory member the device cannot meet. */
const UNSATISFIABLE = Symbol("unsatisfiable");

/** A value that may be a single candidate or a list of alternatives. */
function alternatives(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function isRange(capability: unknown): capability is {
  min?: number;
  max?: number;
} {
  return (
    capability !== null &&
    typeof capability === "object" &&
    !Array.isArray(capability)
  );
}

/**
 * The value `request` settles on against `capability`: `UNSATISFIABLE` when a
 * mandatory member cannot be met, `undefined` when it settles nothing.
 *
 * A range with no `ideal` settles on its `min`, or on its `max` when only that
 * is given — the bound the caller named, kept inside what the device can do.
 */
function resolve(capability: unknown, request: ConstraintRequest): unknown {
  if (request.exact !== undefined) {
    const value = alternatives(request.exact).find((candidate) =>
      canSatisfy(capability, candidate),
    );
    return value === undefined ? UNSATISFIABLE : value;
  }

  if (isRange(capability)) {
    const low = Math.max(
      capability.min ?? Number.NEGATIVE_INFINITY,
      request.min ?? Number.NEGATIVE_INFINITY,
    );
    const high = Math.min(
      capability.max ?? Number.POSITIVE_INFINITY,
      request.max ?? Number.POSITIVE_INFINITY,
    );
    if (low > high) {
      return UNSATISFIABLE;
    }
    if (typeof request.ideal === "number") {
      return Math.min(Math.max(request.ideal, low), high);
    }
    if (request.min !== undefined) {
      return low;
    }
    return request.max !== undefined ? high : undefined;
  }

  // `min` and `max` mean nothing for a list or an on/off feature.
  return request.ideal === undefined
    ? undefined
    : alternatives(request.ideal).find((candidate) =>
        canSatisfy(capability, candidate),
      );
}

/** Whether `capability` — as declared by the device — covers `value`. */
function canSatisfy(capability: unknown, value: unknown): boolean {
  if (typeof capability === "boolean") {
    // A device that declares the feature can be asked to turn it on or off.
    return typeof value === "boolean" && (capability || value === false);
  }
  if (Array.isArray(capability)) {
    return capability.includes(value as never);
  }
  if (capability !== null && typeof capability === "object") {
    const { min, max } = capability as { min?: number; max?: number };
    return (
      typeof value === "number" &&
      value >= (min ?? Number.NEGATIVE_INFINITY) &&
      value <= (max ?? Number.POSITIVE_INFINITY)
    );
  }
  return false;
}

/**
 * Splits a constraint request into what the device settles itself and what the
 * browser is still asked for.
 *
 * Basic constraints follow the same rules as `getUserMedia`: `exact`, `min`
 * and `max` refuse the call when unmet, while `ideal` and bare values settle on
 * the closest value the device supports.
 *
 * `advanced` entries are best effort, as the specification says: one naming
 * something the device cannot do is skipped rather than failing the call, and
 * none of them are ever forwarded — a capture track refuses them all.
 */
export function applyToCapabilities(
  constraints: MediaTrackConstraints,
  capabilities: EnhancedMediaTrackCapabilities,
): AppliedConstraints {
  const declared = capabilities as unknown as Record<string, unknown>;
  const settings: MediaTrackSettings = {};
  const remainder: Record<string, unknown> = {};
  let unsatisfiable: string | null = null;

  const { advanced, ...basic } = constraints as Record<string, unknown> & {
    advanced?: MediaTrackConstraintSet[];
  };

  for (const [name, constraint] of Object.entries(basic)) {
    // Only names the device speaks for; the rest stay the browser's business.
    if (!(name in declared)) {
      remainder[name] = constraint;
      continue;
    }

    const value = resolve(declared[name], parseConstraint(constraint, "ideal"));
    if (value === UNSATISFIABLE) {
      unsatisfiable ??= name;
      continue;
    }
    if (value !== undefined) {
      (settings as Record<string, unknown>)[name] = value;
    }
  }

  for (const entry of advanced ?? []) {
    for (const [name, constraint] of Object.entries(entry)) {
      if (!(name in declared)) {
        continue;
      }
      const value = resolve(
        declared[name],
        parseConstraint(constraint, "exact"),
      );
      if (value !== UNSATISFIABLE && value !== undefined) {
        (settings as Record<string, unknown>)[name] = value;
      }
    }
  }

  return {
    settings,
    remainder: Object.keys(remainder).length > 0 ? remainder : null,
    unsatisfiable,
  };
}
