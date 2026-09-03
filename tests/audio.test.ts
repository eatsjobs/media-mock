import { afterEach, describe, expect, it } from "vitest";
import {
  createMediaMock,
  devices,
  type MockMediaDeviceInfo,
} from "../lib/main";

/**
 * A mocked device that has cameras but no microphone should behave like real
 * hardware in the same shape: an audio request fails rather than quietly
 * returning a video track.
 */
describe("audio", () => {
  const mock = createMediaMock();

  afterEach(() => {
    mock.unmock();
  });

  it("should list the emulated microphone in enumerateDevices", async () => {
    mock.mock(devices["iPhone 12"]);

    const kinds = (await navigator.mediaDevices.enumerateDevices()).map(
      (device) => device.kind,
    );

    expect(kinds).toContain("audioinput");
  });

  it("should list the emulated speaker on devices that expose one", async () => {
    mock.mock(devices["Mac Desktop"]);

    const kinds = (await navigator.mediaDevices.enumerateDevices()).map(
      (device) => device.kind,
    );

    expect(kinds).toContain("audiooutput");
  });

  it("should return an audio-only stream for an audio-only request", async () => {
    mock.mock(devices["iPhone 12"]);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    expect(stream.getAudioTracks()).toHaveLength(1);
    expect(stream.getVideoTracks()).toHaveLength(0);
  });

  it("should not build a capture canvas for an audio-only request", async () => {
    mock.mock(devices["iPhone 12"]);

    await navigator.mediaDevices.getUserMedia({ audio: true });

    expect(document.getElementById("media-mock-canvas")).toBeNull();
  });

  it("should return both tracks when both are requested", async () => {
    mock.mock(devices["iPhone 12"]);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    expect(stream.getVideoTracks()).toHaveLength(1);
    expect(stream.getAudioTracks()).toHaveLength(1);
  });

  it("should not attach an audio track to a video-only request", async () => {
    mock.mock(devices["iPhone 12"]);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });

    expect(stream.getAudioTracks()).toHaveLength(0);
  });

  it("should give the audio track the emulated microphone's identity", async () => {
    mock.mock(devices["iPhone 12"]);
    const [microphone] = (
      await navigator.mediaDevices.enumerateDevices()
    ).filter((device) => device.kind === "audioinput") as MockMediaDeviceInfo[];

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const track = stream.getAudioTracks()[0];

    expect(track.label).toBe(microphone.label);
    expect(track.getSettings().deviceId).toBe(microphone.deviceId);
    expect(track.getSettings().groupId).toBe(microphone.groupId);
  });

  it("should report the microphone's capabilities on the audio track", async () => {
    mock.mock(devices["iPhone 12"]);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const capabilities = stream.getAudioTracks()[0].getCapabilities();

    expect(capabilities.echoCancellation).toEqual([true, false]);
    expect(capabilities.channelCount).toEqual({ min: 1, max: 2 });
  });

  it("should start the audio track live", async () => {
    mock.mock(devices["iPhone 12"]);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    expect(stream.getAudioTracks()[0].readyState).toBe("live");
  });

  it("should end the audio track on unmock", async () => {
    mock.mock(devices["iPhone 12"]);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const track = stream.getAudioTracks()[0];

    mock.unmock();

    expect(track.readyState).toBe("ended");
  });

  it("should reject an audio request on a device with no microphone", async () => {
    // Real hardware answers a request for a device it does not have with
    // NotFoundError rather than substituting something else.
    mock.mock(devices["iPhone 12"]);
    mock.removeMockDevice(
      (await navigator.mediaDevices.enumerateDevices()).find(
        (device) => device.kind === "audioinput",
      )?.deviceId as string,
    );

    await expect(
      navigator.mediaDevices.getUserMedia({ audio: true }),
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });
});
