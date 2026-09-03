import { applyToCapabilities } from "./applyCapabilities";
import { createGetUserMediaError } from "./createGetUserMediaError";
import type {
  EnhancedMediaTrackCapabilities,
  MockMediaDeviceInfo,
} from "./createMediaDeviceInfo";
import { deepCopy } from "./deepCopy";
import type { Resolution } from "./resolution";

/**
 * Making a canvas-capture track look like a camera track.
 *
 * A track from `canvas.captureStream()` reports a synthetic id, an empty label,
 * and settings missing fields every real device provides. Consumers routinely
 * read those to pick a camera, so the mock fills them in.
 */

export interface TrackDecoration {
  /** The device this stream is pretending to come from, when one was selected. */
  device: MockMediaDeviceInfo | undefined;
  /** Frames per second the capture was started with. */
  fps: number;
  /** Size of the captured canvas. */
  resolution: Resolution;
  /** Resolutions the emulated device supports, for a capabilities fallback. */
  deviceResolutions: readonly Resolution[];
}

/**
 * Rewrites a captured track's identity and settings in place.
 */
export function decorateVideoTrack(
  track: MediaStreamTrack,
  { device, fps, resolution, deviceResolutions }: TrackDecoration,
): void {
  applyIdentity(track, device);
  const capabilities = applyCapabilities(track, device, () =>
    capabilitiesFromResolutions(deviceResolutions),
  );

  // What applyConstraints() has settled, reported back through getSettings().
  const applied: MediaTrackSettings = {};
  honourAdvertisedConstraints(track, capabilities, applied);

  extendSettings(track, (settings) => {
    // Real devices always report a frame rate and a frame size.
    if (settings.frameRate === undefined) {
      settings.frameRate = fps;
    }
    if (settings.width === undefined || settings.height === undefined) {
      settings.width = resolution.width;
      settings.height = resolution.height;
    }

    applyDeviceIds(settings, device);

    // Consumers read facingMode to tell front from back — especially on iOS
    // Safari, where one physical back camera appears under several labels.
    if (settings.facingMode === undefined) {
      const supported = device?.getCapabilities?.().facingMode;
      if (Array.isArray(supported) && supported.length > 0) {
        settings.facingMode = supported[0];
      }
    }

    // Anything applyConstraints() settled wins: it is the most recent word.
    Object.assign(settings, applied);
  });
}

/**
 * Rewrites a silent Web Audio track's identity and settings in place, so it
 * reports the emulated microphone rather than the destination node it came
 * from (which labels itself "MediaStreamAudioDestinationNode").
 */
export function decorateAudioTrack(
  track: MediaStreamTrack,
  { device }: { device: MockMediaDeviceInfo | undefined },
): void {
  applyIdentity(track, device);
  applyCapabilities(track, device, () => ({}));
  extendSettings(track, (settings) => applyDeviceIds(settings, device));
}

/**
 * Gives the track the selected device's label and id. A capture track reports a
 * synthetic id and an empty label, which tells a consumer nothing.
 */
function applyIdentity(
  track: MediaStreamTrack,
  device: MockMediaDeviceInfo | undefined,
): void {
  if (device?.label) {
    Object.defineProperty(track, "label", {
      value: device.label,
      writable: false,
      configurable: false,
    });
  }

  // The track id doubles as the device id for consumers that compare them.
  if (device?.deviceId) {
    Object.defineProperty(track, "id", {
      value: device.deviceId,
      writable: false,
      configurable: false,
    });
  }
}

/**
 * Installs the emulated device's capabilities.
 *
 * Chromium and WebKit both give a captured track a getCapabilities() of its
 * own, describing the capture rather than the device: no facingMode, no torch,
 * no zoom, and a deviceId belonging to the capture rather than to any
 * enumerated device. Consumers read exactly those to decide which camera to use
 * and whether to offer a torch button, so the emulated device has to win.
 */
function applyCapabilities(
  track: MediaStreamTrack,
  device: MockMediaDeviceInfo | undefined,
  fallback: () => EnhancedMediaTrackCapabilities,
): EnhancedMediaTrackCapabilities {
  const capabilities = device
    ? {
        ...device.getCapabilities(),
        // MediaTrackCapabilities.deviceId is defined as the track's deviceId
        // setting. A preset's own capabilities value can have drifted from the
        // entry it sits on, so the device entry decides.
        ...(device.deviceId ? { deviceId: device.deviceId } : {}),
        ...(device.groupId ? { groupId: device.groupId } : {}),
      }
    : fallback();

  // A fresh copy per call, so one caller's edit cannot reach the next.
  track.getCapabilities = () => deepCopy(capabilities);

  return capabilities;
}

/**
 * Settles constraints naming something the device advertises, and leaves the
 * rest to the browser.
 *
 * Without this the emulated capabilities are a promise the track cannot keep: a
 * capture track knows nothing of torch or zoom, so asking for one is refused
 * with `OverconstrainedError: Unsupported constraint` even though
 * `getCapabilities()` just said it was available.
 */
function honourAdvertisedConstraints(
  track: MediaStreamTrack,
  capabilities: EnhancedMediaTrackCapabilities,
  applied: MediaTrackSettings,
): void {
  const nativeApply = track.applyConstraints?.bind(track);

  track.applyConstraints = async (
    constraints: MediaTrackConstraints = {},
  ): Promise<void> => {
    const outcome = applyToCapabilities(constraints, capabilities);

    if (outcome.unsatisfiable !== null) {
      throw createGetUserMediaError("OverconstrainedError", {
        constraint: outcome.unsatisfiable,
      });
    }

    Object.assign(applied, outcome.settings);

    if (outcome.remainder !== null && nativeApply) {
      await nativeApply(outcome.remainder);
    }
  };
}

/**
 * Wraps `getSettings` so `extend` can fill in what the captured track omits.
 */
function extendSettings(
  track: MediaStreamTrack,
  extend: (settings: MediaTrackSettings) => void,
): void {
  const originalGetSettings = track.getSettings.bind(track);
  track.getSettings = () => {
    const settings = originalGetSettings();
    extend(settings);
    return settings;
  };
}

/**
 * Reports the source device's ids. Some browsers put the capture's own random
 * uuid in `deviceId` instead, which is misleading, and none of them fill in a
 * `groupId` — which is how a consumer pairs a camera with the microphone in the
 * same enclosure.
 */
function applyDeviceIds(
  settings: MediaTrackSettings,
  device: MockMediaDeviceInfo | undefined,
): void {
  if (device?.deviceId) {
    settings.deviceId = device.deviceId;
  }
  if (device?.groupId) {
    settings.groupId = device.groupId;
  }
}

/**
 * Capabilities derived from the device's resolution list, used when the device
 * config declares none of its own.
 */
function capabilitiesFromResolutions(
  resolutions: readonly Resolution[],
): EnhancedMediaTrackCapabilities {
  const widths = resolutions.map((res) => res.width);
  const heights = resolutions.map((res) => res.height);

  return {
    width: { min: Math.min(...widths), max: Math.max(...widths) },
    height: { min: Math.min(...heights), max: Math.max(...heights) },
    frameRate: { min: 1, max: 60 },
    facingMode: ["user", "environment"],
    resizeMode: ["none", "crop-and-scale"],
  };
}
