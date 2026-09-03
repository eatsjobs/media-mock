import {
  createMediaDeviceInfo,
  type EnhancedMediaTrackCapabilities,
  type MockMediaDeviceInfo,
} from "./createMediaDeviceInfo";

/**
 * Which constraint names the mocked device reports as supported via
 * getSupportedConstraints(). Mirrors MediaTrackSupportedConstraints plus
 * common non-standard extras (torch, zoom, whiteBalanceMode, volume).
 */
export type SupportedConstraints = Partial<
  Record<
    | keyof MediaTrackSupportedConstraints
    | "torch"
    | "volume"
    | "whiteBalanceMode"
    | "zoom",
    boolean
  >
>;

const defaultSupportedConstraints: SupportedConstraints = {
  aspectRatio: true,
  deviceId: true,
  displaySurface: true,
  echoCancellation: true,
  facingMode: true,
  frameRate: true,
  groupId: false,
  height: true,
  sampleRate: false,
  sampleSize: false,
  torch: true,
  volume: true,
  whiteBalanceMode: true,
  width: true,
  zoom: true,
};

const defaultSupportedConstraintsDesktop: SupportedConstraints = {
  ...defaultSupportedConstraints,
  torch: false,
};
/**
 * What a built-in microphone reports. Every emulated device shares these: the
 * numbers barely differ between real handsets, unlike camera capabilities.
 *
 * `deviceId` and `groupId` are filled in from the device entry when a track is
 * decorated, so they are deliberately absent here.
 */
const audioInputCapabilities: EnhancedMediaTrackCapabilities = {
  autoGainControl: [true, false],
  channelCount: { max: 2, min: 1 },
  echoCancellation: [true, false],
  noiseSuppression: [true, false],
  sampleRate: { max: 48000, min: 44100 },
  sampleSize: { max: 16, min: 16 },
};

export interface DeviceConfig {
  videoResolutions: { width: number; height: number }[];
  mediaDeviceInfo: MockMediaDeviceInfo[];
  supportedConstraints: SupportedConstraints;
}

type DeviceName = "iPhone 12" | "Samsung Galaxy M53" | "Mac Desktop";

/**
 * A list of devices to mock. For now we have
 * - iPhone 12
 * - Samsung Galaxy M53
 * - Mac Desktop
 *
 * @type {Record<DeviceName, DeviceConfig>}
 */
export const devices: Record<DeviceName, DeviceConfig> = {
  "iPhone 12": {
    videoResolutions: [
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
      { width: 640, height: 480 },
      { width: 320, height: 240 },
    ],
    mediaDeviceInfo: [
      createMediaDeviceInfo({
        deviceId: "A7FB77364106629BF38E043E6B000EE5FD680B9B",
        kind: "videoinput",
        label: "Front Camera",
        groupId: "C1B048C04520A18C3611DC837450814245482489",
        mockCapabilities: {
          aspectRatio: { max: 4032, min: 0.00033068783068783067 },
          deviceId: "1A100C35A33042B643BE0438DBBF9FDC95AF1913",
          facingMode: ["user"],
          frameRate: { max: 60, min: 1 },
          groupId: "C1B048C04520A18C3611DC837450814245482489",
          height: { max: 3024, min: 1 },
          whiteBalanceMode: ["manual", "continuous"],
          width: { max: 4032, min: 1 },
          zoom: { max: 4, min: 1 },
        },
      }),
      createMediaDeviceInfo({
        deviceId: "9729B396E0C2B460BC7B69C0E368EB0B605058A9",
        kind: "videoinput",
        label: "Back Dual Wide Camera",
        groupId: "A1F2417053FF79495E7D01AF37A6C4461CE0C060",
        mockCapabilities: {
          aspectRatio: { max: 4032, min: 0.00033068783068783067 },
          deviceId: "D87C414E22C375BB0697DCB83A24D97BD520624D",
          facingMode: ["environment"],
          focusDistance: { min: 0.12 },
          frameRate: { max: 60, min: 1 },
          groupId: "A1F2417053FF79495E7D01AF37A6C4461CE0C060",
          height: { max: 3024, min: 1 },
          torch: true,
          whiteBalanceMode: ["manual", "continuous"],
          width: { max: 4032, min: 1 },
          zoom: { max: 2, min: 0.5 },
        },
      }),
      createMediaDeviceInfo({
        deviceId: "0B74C1149038CA5235F6C2325E53AE22AA920379",
        kind: "videoinput",
        label: "Back Ultra Wide Camera",
        groupId: "B402A3862F28FB8D54BDF33BD7D41874FE175517",
        mockCapabilities: {
          aspectRatio: { max: 4032, min: 0.00033068783068783067 },
          deviceId: "BE00A990BEDE2D324EB0AD51F567EE4ADC24D9B0",
          facingMode: ["environment"],
          focusDistance: { min: 0.12 },
          frameRate: { max: 60, min: 1 },
          groupId: "B402A3862F28FB8D54BDF33BD7D41874FE175517",
          height: { max: 3024, min: 1 },
          torch: true,
          whiteBalanceMode: ["manual", "continuous"],
          width: { max: 4032, min: 1 },
          zoom: { max: 4, min: 1 },
        },
      }),
      createMediaDeviceInfo({
        deviceId: "C92FE814FCB4F2F856CDCBFD1C555429774DD0E2",
        kind: "videoinput",
        label: "Back Camera",
        groupId: "14122C2CE97B69A84360822AB87E8206C32B5BD8",
        mockCapabilities: {
          aspectRatio: { max: 4032, min: 0.00033068783068783067 },
          deviceId: "D13A012C1D5C9F9899B40BDA0790184EE57FD282",
          facingMode: ["environment"],
          focusDistance: { min: 0.12 },
          frameRate: { max: 60, min: 1 },
          groupId: "14122C2CE97B69A84360822AB87E8206C32B5BD8",
          height: { max: 3024, min: 1 },
          torch: true,
          whiteBalanceMode: ["manual", "continuous"],
          width: { max: 4032, min: 1 },
          zoom: { max: 4, min: 1 },
        },
      }),
      createMediaDeviceInfo({
        deviceId: "2B0BDF0A9F4F4B0C9EC0B1D8A0F5E6C7D8E9F0A1",
        groupId: "3C1CE01BAF5F5C1DAFD1C2E9B1F6F7D8E9F0A1B2",
        kind: "audioinput",
        label: "iPhone Microphone",
        mockCapabilities: audioInputCapabilities,
      }),
    ],
    supportedConstraints: defaultSupportedConstraints,
  },
  "Samsung Galaxy M53": {
    videoResolutions: [
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
      { width: 640, height: 480 },
    ],
    mediaDeviceInfo: [
      createMediaDeviceInfo({
        deviceId:
          "87fcafb209f5ff2a6d7c8a5d14afe1c9aba9f209330e93933e545e40b102b35f",
        groupId:
          "f70f63d2f4eea57dafe6c6b60833aa69a02f06bb0a6878cb277fb4d70daa9020",
        kind: "videoinput",
        label: "camera2 1, facing front",
        mockCapabilities: {
          aspectRatio: { max: 2400, min: 0.0009191176470588235 },
          deviceId:
            "87fcafb209f5ff2a6d7c8a5d14afe1c9aba9f209330e93933e545e40b102b35f",
          facingMode: ["user"],
          frameRate: { max: 30, min: 1 },
          groupId:
            "f70f63d2f4eea57dafe6c6b60833aa69a02f06bb0a6878cb277fb4d70daa9020",
          height: { max: 1088, min: 1 },
          resizeMode: ["none", "crop-and-scale"],
          width: { max: 2400, min: 1 },
        },
      }),
      createMediaDeviceInfo({
        deviceId:
          "81cb5898aebd672ef65d04ed1bc7b00c704f2b6aa94200bc5556ff02c89ea14d",
        groupId:
          "7300f91d6cb037dcaa6fe16abb59f4e9f92fb471e2280ff0e313e07c49cb536c",
        kind: "videoinput",
        label: "camera2 2, facing front",
        mockCapabilities: {
          aspectRatio: { max: 2400, min: 0.0009191176470588235 },
          deviceId:
            "81cb5898aebd672ef65d04ed1bc7b00c704f2b6aa94200bc5556ff02c89ea14d",
          facingMode: ["user"],
          frameRate: { max: 30, min: 1 },
          groupId:
            "7300f91d6cb037dcaa6fe16abb59f4e9f92fb471e2280ff0e313e07c49cb536c",
          height: { max: 1088, min: 1 },
          resizeMode: ["none", "crop-and-scale"],
          width: { max: 2400, min: 1 },
        },
      }),
      createMediaDeviceInfo({
        deviceId:
          "99be6eecad8c050052df5dbb08b0460d2715b0a3b18fc5c7f08d6073d312ca34",
        groupId:
          "40f44b864c99ab042a21cf87df882d0ef5c7f88f7cbfcee74cefc1e393b8616b",
        kind: "videoinput",
        label: "camera2 0, facing back",
        mockCapabilities: {
          aspectRatio: { max: 3840, min: 0.000462962962962963 },
          deviceId:
            "99be6eecad8c050052df5dbb08b0460d2715b0a3b18fc5c7f08d6073d312ca34",
          facingMode: ["environment"],
          frameRate: { max: 30, min: 1 },
          groupId:
            "40f44b864c99ab042a21cf87df882d0ef5c7f88f7cbfcee74cefc1e393b8616b",
          height: { max: 2160, min: 1 },
          resizeMode: ["none", "crop-and-scale"],
          width: { max: 3840, min: 1 },
          torch: true,
        },
      }),
      createMediaDeviceInfo({
        deviceId: "default",
        groupId:
          "5f5cb9d4b4c2d3e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7",
        kind: "audioinput",
        label: "Default - Microphone (Built-in)",
        mockCapabilities: audioInputCapabilities,
      }),
      createMediaDeviceInfo({
        deviceId: "default",
        groupId:
          "5f5cb9d4b4c2d3e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7",
        kind: "audiooutput",
        label: "Default - Speaker",
        mockCapabilities: {},
      }),
    ],
    supportedConstraints: defaultSupportedConstraints,
  },
  "Mac Desktop": {
    videoResolutions: [
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
      { width: 640, height: 480 },
    ],
    mediaDeviceInfo: [
      createMediaDeviceInfo({
        deviceId: "e91a0ba82ba051029709163c442d340a3919dfabd",
        groupId: "7ce19c839ef9ab1a4cba8d4dd4d3c1bbbf3ad",
        kind: "videoinput",
        label: "FaceTime HD Camera (2C0E:82E3)",
        mockCapabilities: {
          aspectRatio: { max: 1920, min: 0.0005208333333333333 },
          backgroundBlur: [false],
          deviceId: "370CF6B3449B7B73599E8DAEEE75FB41788A0712",
          frameRate: { max: 30, min: 1 },
          groupId: "F2EFF7249C97B5531FF959C8F977138341165F6B",
          height: { max: 1920, min: 1 },
          width: { max: 1920, min: 1 },
        },
      }),
      createMediaDeviceInfo({
        deviceId: "default",
        groupId: "A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4",
        kind: "audioinput",
        label: "MacBook Pro Microphone (Built-in)",
        mockCapabilities: audioInputCapabilities,
      }),
      createMediaDeviceInfo({
        deviceId: "default",
        groupId: "A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4",
        kind: "audiooutput",
        label: "MacBook Pro Speakers (Built-in)",
        mockCapabilities: {},
      }),
    ],
    supportedConstraints: defaultSupportedConstraintsDesktop,
  },
};
