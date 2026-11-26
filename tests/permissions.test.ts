import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { devices, MediaMock } from "../lib/main";

/**
 * The permission prompt in real browsers: real capture tracks, the native
 * `Permissions.prototype`, and the task boundaries Playwright's
 * `page.evaluate` puts between steps.
 */
describe("permission prompt in a real browser", () => {
  const imageUrl = "/assets/ean8_12345670.png";
  const nativeQuery = Permissions.prototype.query;

  const query = (name: string) =>
    navigator.permissions.query({ name: name as PermissionName });

  const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

  const rejection = (promise: Promise<unknown>) =>
    promise.then(
      () => {
        throw new Error("expected a rejection");
      },
      (error: DOMException) => error,
    );

  beforeEach(async () => {
    MediaMock.unmock();
  });

  afterAll(() => {
    MediaMock.unmock();
  });

  it("full flow with real frames", async () => {
    MediaMock.mock(devices["iPhone 12"]);
    await MediaMock.setSource(imageUrl);
    MediaMock.setPermissionState("camera", "prompt");

    const pending = navigator.mediaDevices.getUserMedia({ video: true });
    expect(await MediaMock.waitForPermissionPrompt()).toEqual({
      camera: true,
      microphone: false,
    });
    MediaMock.answerPermissionPrompt("allow");
    const [track] = (await pending).getVideoTracks();

    expect(track.readyState).toBe("live");
    expect((await query("camera")).state).toBe("granted");
  });

  it("every step can run in its own task, as page.evaluate does", async () => {
    MediaMock.mock(devices["iPhone 12"]);
    await MediaMock.setSource(imageUrl);
    MediaMock.setPermissionState("camera", "prompt");
    await nextTask();

    const pending = navigator.mediaDevices.getUserMedia({ video: true });
    await nextTask();

    const prompt = await MediaMock.waitForPermissionPrompt();
    expect(structuredClone(prompt)).toEqual(prompt);
    await nextTask();

    MediaMock.answerPermissionPrompt("allow");
    await nextTask();

    await expect(pending).resolves.toBeInstanceOf(MediaStream);
  });

  it("one prompt covers camera and microphone requested together", async () => {
    MediaMock.mock(devices["iPhone 12"]);
    await MediaMock.setSource(imageUrl);
    MediaMock.setPermissionState("camera", "prompt");
    MediaMock.setPermissionState("microphone", "prompt");

    const pending = navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    expect(await MediaMock.waitForPermissionPrompt()).toEqual({
      camera: true,
      microphone: true,
    });
    MediaMock.answerPermissionPrompt("allow");
    const stream = await pending;

    expect(stream.getVideoTracks()).toHaveLength(1);
    expect(stream.getAudioTracks()).toHaveLength(1);
    expect((await query("camera")).state).toBe("granted");
    expect((await query("microphone")).state).toBe("granted");
  });

  it("query patches the native Permissions prototype", () => {
    MediaMock.mock(devices["iPhone 12"]);

    expect(navigator.permissions.query).toBe(Permissions.prototype.query);
    expect(navigator.permissions.query).not.toBe(nativeQuery);
    expect(navigator.permissions.query.name).toBe("query");

    MediaMock.unmock();
    expect(Permissions.prototype.query).toBe(nativeQuery);
  });

  it("unknown permission names reach the native query", async () => {
    MediaMock.mock(devices["iPhone 12"]);

    const status = await query("notifications");

    expect(status).toBeInstanceOf(PermissionStatus);
  });

  it("permissions: false leaves the native query in place", () => {
    MediaMock.mock(devices["iPhone 12"], { permissions: false });

    expect(navigator.permissions.query).toBe(nativeQuery);
  });

  it("revocation ends a real capture track with one ended event", async () => {
    MediaMock.mock(devices["iPhone 12"]);
    await MediaMock.setSource(imageUrl);
    const [track] = (
      await navigator.mediaDevices.getUserMedia({ video: true })
    ).getVideoTracks();
    let ended = 0;
    const endedOnce = new Promise<void>((resolve) =>
      track.addEventListener("ended", () => {
        ended++;
        resolve();
      }),
    );

    MediaMock.setPermissionState("camera", "denied");
    await endedOnce;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(track.readyState).toBe("ended");
    expect(ended).toBe(1);
  });

  it("unmock right after allow aborts the call and leaves no canvas behind", async () => {
    MediaMock.mock(devices["iPhone 12"]);
    await MediaMock.setSource(imageUrl);
    MediaMock.setPermissionState("camera", "prompt");
    const pending = navigator.mediaDevices.getUserMedia({ video: true });
    await MediaMock.waitForPermissionPrompt();

    MediaMock.answerPermissionPrompt("allow");
    MediaMock.unmock();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(document.getElementById("media-mock-canvas")).toBeNull();
  });

  it("unmock while the source is still loading aborts the call and leaves no canvas behind", async () => {
    MediaMock.mock(devices["iPhone 12"]);
    void MediaMock.setSource(imageUrl);
    const pending = navigator.mediaDevices.getUserMedia({ video: true });

    MediaMock.unmock();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(document.getElementById("media-mock-canvas")).toBeNull();
  });

  it("deny and dismiss reject with the expected messages", async () => {
    MediaMock.mock(devices["iPhone 12"]);
    await MediaMock.setSource(imageUrl);
    MediaMock.setPermissionState("camera", "prompt");

    const dismissed = navigator.mediaDevices.getUserMedia({ video: true });
    await MediaMock.waitForPermissionPrompt();
    MediaMock.answerPermissionPrompt("dismiss");
    const dismissError = await rejection(dismissed);
    expect(dismissError).toBeInstanceOf(DOMException);
    expect(dismissError.name).toBe("NotAllowedError");
    expect(dismissError.message).toBe("Permission dismissed");

    const denied = navigator.mediaDevices.getUserMedia({ video: true });
    await MediaMock.waitForPermissionPrompt();
    MediaMock.answerPermissionPrompt("deny");
    const denyError = await rejection(denied);
    expect(denyError.name).toBe("NotAllowedError");
    expect(denyError.message).toBe("Permission denied");
  });
});
