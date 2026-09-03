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

/** The concrete value a constrainable asks for, ignoring how it was phrased. */
function requestedValue(constraint: unknown): unknown {
  if (constraint !== null && typeof constraint === "object") {
    const candidates = constraint as Record<string, unknown>;
    for (const key of ["exact", "ideal"]) {
      if (candidates[key] !== undefined) {
        return candidates[key];
      }
    }
    return undefined;
  }
  return constraint;
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

    const value = requestedValue(constraint);
    if (!canSatisfy(declared[name], value)) {
      // Basic constraints are mandatory, so this is a refusal.
      unsatisfiable ??= name;
      continue;
    }
    (settings as Record<string, unknown>)[name] = value;
  }

  for (const entry of advanced ?? []) {
    for (const [name, constraint] of Object.entries(entry)) {
      const value = requestedValue(constraint);
      if (name in declared && canSatisfy(declared[name], value)) {
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
