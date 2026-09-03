import { afterEach, describe, expect, it } from "vitest";
import {
  createMediaMock,
  devices,
  type MockMediaDeviceInfo,
} from "../../lib/main";

/**
 * happy-dom has no MediaDevices, no canvas 2D context and no Web Audio, so it
 * can never produce real frames. It can still answer every question about which
 * devices exist and what they can do — which is what a unit test usually asks.
 */
describe("a DOM emulator with no media stack", () => {
  const mock = createMediaMock();
  const frameless = { frames: false, audio: false } as const;

  afterEach(() => {
    mock.unmock();
  });

  it("should install navigator.mediaDevices where the environment has none", () => {
    expect(navigator.mediaDevices).toBeUndefined();

    mock.mock(devices["iPhone 12"], frameless);

    expect(navigator.mediaDevices).toBeDefined();
    expect(typeof navigator.mediaDevices.getUserMedia).toBe("function");
  });

  it("should take navigator.mediaDevices away again on unmock", () => {
    mock.mock(devices["iPhone 12"], frameless);

    mock.unmock();

    expect(navigator.mediaDevices).toBeUndefined();
  });

  it("should enumerate the emulated devices", async () => {
    mock.mock(devices["iPhone 12"], frameless);

    const enumerated = await navigator.mediaDevices.enumerateDevices();

    expect(enumerated).toHaveLength(
      devices["iPhone 12"].mediaDeviceInfo.length,
    );
    expect(enumerated[0].label).toBe("Front Camera");
  });

  it("should report the device's capabilities", async () => {
    mock.mock(devices["iPhone 12"], frameless);

    const [camera] =
      (await navigator.mediaDevices.enumerateDevices()) as unknown as MockMediaDeviceInfo[];

    expect(camera.getCapabilities().facingMode).toEqual(["user"]);
  });

  it("should report the supported constraints", () => {
    mock.mock(devices["Mac Desktop"], frameless);

    expect(navigator.mediaDevices.getSupportedConstraints()).toStrictEqual(
      devices["Mac Desktop"].supportedConstraints,
    );
  });

  it("should fire devicechange", () => {
    mock.mock(devices["iPhone 12"], frameless);
    let fired = 0;
    navigator.mediaDevices.addEventListener("devicechange", () => {
      fired++;
    });

    mock.removeMockDevice(devices["iPhone 12"].mediaDeviceInfo[0].deviceId);

    expect(fired).toBe(1);
  });

  it("should simulate a permission denial", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    mock.simulateGetUserMediaError("NotAllowedError");

    await expect(
      navigator.mediaDevices.getUserMedia({ video: true }),
    ).rejects.toMatchObject({ name: "NotAllowedError" });
  });

  it("should redact enumerateDevices while permission is denied", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    mock.simulateGetUserMediaError("NotAllowedError");

    const [first] = await navigator.mediaDevices.enumerateDevices();

    expect(first.label).toBe("");
    expect(first.kind).toBe("videoinput");
  });

  it("should refuse a request the device cannot serve", async () => {
    mock.mock(devices["iPhone 12"], frameless);

    await expect(
      navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: "nope" } },
      }),
    ).rejects.toMatchObject({ constraint: "deviceId" });
  });

  it("should reject an empty request with a TypeError", async () => {
    mock.mock(devices["iPhone 12"], frameless);

    await expect(
      navigator.mediaDevices.getUserMedia({}),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("should return a decorated video track without producing frames", async () => {
    mock.mock(devices["iPhone 12"], frameless);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    const [track] = stream.getVideoTracks();

    expect(track.label).toBe("Back Camera");
    expect(track.getSettings().deviceId).toBe(
      "C92FE814FCB4F2F856CDCBFD1C555429774DD0E2",
    );
    expect(track.readyState).toBe("live");
  });

  it("should build no canvas in frameless mode", async () => {
    mock.mock(devices["iPhone 12"], frameless);

    await navigator.mediaDevices.getUserMedia({ video: true });

    expect(document.getElementById("media-mock-canvas")).toBeNull();
  });

  it("should end a frameless track on unmock", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const [track] = stream.getVideoTracks();

    mock.unmock();

    expect(track.readyState).toBe("ended");
  });

  it("should name the way out when frames are asked for and impossible", async () => {
    // The default is frames: true, which cannot work without a 2D context.
    // The error has to say so, or the reader is left guessing.
    mock.mock(devices["iPhone 12"]);

    await expect(
      navigator.mediaDevices.getUserMedia({ video: true }),
    ).rejects.toThrow(/frames: false/);
  });

  it("should refuse audio when audio production is disabled", async () => {
    mock.mock(devices["iPhone 12"], frameless);

    await expect(
      navigator.mediaDevices.getUserMedia({ audio: true }),
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });
});
