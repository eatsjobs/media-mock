export interface EnhancedMediaTrackCapabilities extends MediaTrackCapabilities {
  whiteBalanceMode?: string[];
  focusDistance?: { min: number };
  zoom?: { max: number; min: number };
  torch?: boolean;
  backgroundBlur?: boolean[];
  resizeMode?: string[];
}

export interface MockMediaDeviceInfo extends MediaDeviceInfo {
  getCapabilities: () => EnhancedMediaTrackCapabilities;
}


/**
 * Creates a mock MediaDeviceInfo object.
 *
 * @export
 * @param {{
 *   deviceId: string;
 *   groupId: string;
 *   kind: MediaDeviceKind;
 *   label: string;
 *   mockCapabilities?: EnhancedMediaTrackCapabilities;
 * }} param0
 * @param {string} param0.deviceId
 * @param {string} param0.groupId
 * @param {MediaDeviceKind} param0.kind
 * @param {string} param0.label
 * @param {EnhancedMediaTrackCapabilities} [param0.mockCapabilities={
 *     width: { min: 1, max: 1280 },
 *     height: { min: 1, max: 720 },
 *   }]
 * @returns {MockMediaDeviceInfo}
 */
export function createMediaDeviceInfo({
  deviceId,
  groupId,
  kind,
  label,
  mockCapabilities = {
    width: { min: 1, max: 1280 },
    height: { min: 1, max: 720 },
  },
}: {
  deviceId: string;
  groupId: string;
  kind: MediaDeviceKind;
  label: string;
  mockCapabilities?: EnhancedMediaTrackCapabilities;
}): MockMediaDeviceInfo {
  return {
    deviceId,
    groupId,
    kind,
    label,
    getCapabilities: (): EnhancedMediaTrackCapabilities => {
      return mockCapabilities;
    },
    toJSON() {
      return {
        deviceId: `${this.deviceId}`,
        kind: this.kind,
        label: `${this.label}`,
        groupId: `${this.groupId}`,
      };
    },
  };
}
