import {
  type MockMediaDeviceInfo,
  redactMediaDeviceInfo,
} from "./createMediaDeviceInfo";
import type { DeviceConfig } from "./devices";

/**
 * Reading and selecting from the emulated device list.
 *
 * No DOM access: unit-tested in node.
 */

/**
 * Copies a device config so runtime changes — `addMockDevice`,
 * `removeMockDevice` — never reach the caller's object. The exported presets are
 * shared across tests, so mutating them leaks state between them.
 *
 * Device entries themselves are shared by reference: they are immutable value
 * objects created by `createMediaDeviceInfo`.
 */
export function cloneDeviceConfig(config: DeviceConfig): DeviceConfig {
  return {
    ...config,
    videoResolutions: config.videoResolutions.map((res) => ({ ...res })),
    mediaDeviceInfo: [...config.mediaDeviceInfo],
    supportedConstraints: { ...config.supportedConstraints },
  };
}

/**
 * The device a `getUserMedia` call should report as its source.
 *
 * An explicit `deviceId` wins, as in real browsers. Otherwise a `facingMode`
 * picks the **last** matching camera: device lists run wide-to-telephoto, and
 * the last environment-facing entry is what a real device reports as its default
 * back camera. Falls back to the first videoinput.
 */
export function selectVideoDevice(
  config: DeviceConfig,
  {
    deviceId,
    facingMode,
  }: { deviceId?: string | null; facingMode?: string | null },
): MockMediaDeviceInfo | undefined {
  const videoDevices = config.mediaDeviceInfo.filter(
    (device) => device.kind === "videoinput",
  );

  if (videoDevices.length === 0) {
    return undefined;
  }

  if (deviceId) {
    const requested = videoDevices.find(
      (device) => device.deviceId === deviceId,
    );
    if (requested) {
      return requested;
    }
  }

  if (facingMode) {
    const matching = videoDevices.filter((device) => {
      const supported = device.getCapabilities().facingMode;
      return Array.isArray(supported) && supported.includes(facingMode);
    });
    if (matching.length > 0) {
      return matching[matching.length - 1];
    }
  }

  return videoDevices[0];
}

/**
 * The microphone a `getUserMedia` call should report as its source.
 *
 * An explicit `deviceId` wins, as in real browsers; otherwise the first
 * audioinput, which is the one browsers list as the default.
 */
export function selectAudioDevice(
  config: DeviceConfig,
  { deviceId }: { deviceId?: string | null },
): MockMediaDeviceInfo | undefined {
  const audioDevices = config.mediaDeviceInfo.filter(
    (device) => device.kind === "audioinput",
  );

  if (deviceId) {
    const requested = audioDevices.find(
      (device) => device.deviceId === deviceId,
    );
    if (requested) {
      return requested;
    }
  }

  return audioDevices[0];
}

/**
 * The list `enumerateDevices()` should resolve with.
 *
 * When redacted, entries keep their `kind` but lose `label`, `deviceId` and
 * `groupId` — what real browsers report before camera permission is granted.
 */
export function listDevices(
  config: DeviceConfig,
  { redacted }: { redacted: boolean },
): MockMediaDeviceInfo[] {
  return redacted
    ? config.mediaDeviceInfo.map(redactMediaDeviceInfo)
    : config.mediaDeviceInfo;
}
