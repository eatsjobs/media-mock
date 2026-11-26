import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { devices, MediaMock } from "../lib/main";

/**
 * The scenarios in the README's "Permission scenarios" section, verbatim, so
 * the documented samples keep working. Edit both together.
 */
describe("README permission scenarios", () => {
  beforeEach(() => {
    MediaMock.unmock();
  });

  afterAll(() => {
    MediaMock.unmock();
  });

  it("first visit: the app explains, then asks", async () => {
    MediaMock.mock(devices["iPhone 12"]).setPermissionState("camera", "prompt");

    // The app checks first, to show its own explainer before the browser prompt.
    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    expect(status.state).toBe("prompt");

    const pending = navigator.mediaDevices.getUserMedia({ video: true });
    await MediaMock.waitForPermissionPrompt();

    const changed = new Promise((resolve) =>
      status.addEventListener("change", resolve, { once: true }),
    );
    MediaMock.answerPermissionPrompt("allow");

    await expect(pending).resolves.toBeInstanceOf(MediaStream);
    await changed;
    expect(status.state).toBe("granted");
  });

  it("the user denies the prompt", async () => {
    MediaMock.mock(devices["iPhone 12"]).setPermissionState("camera", "prompt");

    const pending = navigator.mediaDevices.getUserMedia({ video: true });
    await MediaMock.waitForPermissionPrompt();
    MediaMock.answerPermissionPrompt("deny");

    await expect(pending).rejects.toMatchObject({
      name: "NotAllowedError",
      message: "Permission denied",
    });

    // The browser remembers: asking again fails at once, with no prompt.
    await expect(
      navigator.mediaDevices.getUserMedia({ video: true }),
    ).rejects.toMatchObject({ name: "NotAllowedError" });
  });

  it("the user closes the prompt without choosing", async () => {
    MediaMock.mock(devices["iPhone 12"]).setPermissionState("camera", "prompt");

    const pending = navigator.mediaDevices.getUserMedia({ video: true });
    await MediaMock.waitForPermissionPrompt();
    MediaMock.answerPermissionPrompt("dismiss");

    await expect(pending).rejects.toMatchObject({
      name: "NotAllowedError",
      message: "Permission dismissed",
    });

    // Nothing was decided, so a retry prompts again.
    const retry = navigator.mediaDevices.getUserMedia({ video: true });
    await MediaMock.waitForPermissionPrompt();
    MediaMock.answerPermissionPrompt("allow");
    await expect(retry).resolves.toBeInstanceOf(MediaStream);
  });

  it("a returning user who blocked the camera", async () => {
    MediaMock.mock(devices["iPhone 12"]).setPermissionState("camera", "denied");

    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    expect(status.state).toBe("denied");

    // Cameras are listed, but without labels or ids.
    const [camera] = await navigator.mediaDevices.enumerateDevices();
    expect(camera.kind).toBe("videoinput");
    expect(camera.label).toBe("");

    await expect(
      navigator.mediaDevices.getUserMedia({ video: true }),
    ).rejects.toMatchObject({ name: "NotAllowedError" });
  });

  it("the user allows, but another app holds the camera", async () => {
    MediaMock.mock(devices["iPhone 12"])
      .setPermissionState("camera", "prompt")
      .simulateGetUserMediaError("NotReadableError", {
        message: "Camera is in use by another app",
      });

    const pending = navigator.mediaDevices.getUserMedia({ video: true });
    await MediaMock.waitForPermissionPrompt();
    MediaMock.answerPermissionPrompt("allow");

    await expect(pending).rejects.toMatchObject({
      name: "NotReadableError",
      message: "Camera is in use by another app",
    });

    // Access was granted; only the hardware failed.
    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    expect(status.state).toBe("granted");
  });

  it("camera and microphone together, microphone already allowed", async () => {
    // The microphone keeps its default, "granted".
    MediaMock.mock(devices["iPhone 12"]).setPermissionState("camera", "prompt");

    const pending = navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    // One prompt, asking only for what is still undecided.
    expect(await MediaMock.waitForPermissionPrompt()).toEqual({
      camera: true,
      microphone: false,
    });
    MediaMock.answerPermissionPrompt("allow");

    const stream = await pending;
    expect(stream.getVideoTracks()).toHaveLength(1);
    expect(stream.getAudioTracks()).toHaveLength(1);
  });

  it("access is revoked while the camera is live", async () => {
    MediaMock.mock(devices["iPhone 12"]);
    const [track] = (
      await navigator.mediaDevices.getUserMedia({ video: true })
    ).getVideoTracks();

    const ended = new Promise((resolve) =>
      track.addEventListener("ended", resolve, { once: true }),
    );

    // The user blocks the camera from the browser's site settings.
    MediaMock.setPermissionState("camera", "denied");

    await ended;
    expect(track.readyState).toBe("ended");
  });

  it("the app asks twice at once (React StrictMode)", async () => {
    MediaMock.mock(devices["iPhone 12"]).setPermissionState("camera", "prompt");

    const first = navigator.mediaDevices.getUserMedia({ video: true });
    const second = navigator.mediaDevices.getUserMedia({ video: true });

    // One prompt; the answer covers both requests.
    await MediaMock.waitForPermissionPrompt();
    MediaMock.answerPermissionPrompt("allow");

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it("a test ends while the prompt is still open", async () => {
    MediaMock.mock(devices["iPhone 12"]).setPermissionState("camera", "prompt");

    const pending = navigator.mediaDevices.getUserMedia({ video: true });
    await MediaMock.waitForPermissionPrompt();

    // In afterEach: the waiting call settles, so nothing leaks into the next test.
    MediaMock.unmock();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
