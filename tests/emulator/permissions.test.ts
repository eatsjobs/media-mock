import { afterEach, describe, expect, it, vi } from "vitest";
import { createMediaMock, devices } from "../../lib/main";

/**
 * The permission half of the mock — `navigator.permissions`, redaction and the
 * prompt — needs no frames, so it is covered here under both DOM emulators.
 */
describe("permission state", () => {
  const mock = createMediaMock();
  const frameless = { frames: false, audio: false } as const;

  const query = (name: "camera" | "microphone") =>
    navigator.permissions.query({ name: name as PermissionName });

  const nextChange = (status: PermissionStatus) =>
    new Promise<Event>((resolve) =>
      status.addEventListener("change", resolve, { once: true }),
    );

  afterEach(() => {
    mock.unmock();
  });

  it("query reports granted by default", async () => {
    mock.mock(devices["iPhone 12"], frameless);

    expect((await query("camera")).state).toBe("granted");
    expect((await query("microphone")).state).toBe("granted");
  });

  it("query reports the state set with setPermissionState", async () => {
    mock.mock(devices["iPhone 12"], frameless);

    mock.setPermissionState("camera", "prompt");
    mock.setPermissionState("microphone", "denied");

    expect((await query("camera")).state).toBe("prompt");
    expect((await query("microphone")).state).toBe("denied");
  });

  it("a held PermissionStatus fires change when the state is set", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    const status = await query("camera");

    mock.setPermissionState("camera", "denied");
    await nextChange(status);

    expect(status.state).toBe("denied");
  });

  it("setPermissionState is chainable", () => {
    mock.mock(devices["iPhone 12"], frameless);

    expect(mock.setPermissionState("camera", "prompt")).toBe(mock);
  });

  it("setPermissionState rejects unknown names and states", () => {
    mock.mock(devices["iPhone 12"], frameless);

    expect(() => mock.setPermissionState("mic" as never, "granted")).toThrow(
      TypeError,
    );
    expect(() => mock.setPermissionState("mic" as never, "granted")).toThrow(
      /mic/,
    );
    expect(() => mock.setPermissionState("camera", "allowed" as never)).toThrow(
      /allowed/,
    );
  });

  it("query reports denied while NotAllowedError is simulated, and the stored state again once cleared", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    mock.setPermissionState("camera", "prompt");
    const status = await query("camera");

    mock.simulateGetUserMediaError("NotAllowedError");
    await nextChange(status);
    expect(status.state).toBe("denied");
    expect((await query("microphone")).state).toBe("denied");

    mock.clearGetUserMediaError();
    await nextChange(status);
    expect(status.state).toBe("prompt");
    expect((await query("microphone")).state).toBe("granted");
  });

  it("other simulated errors do not affect query", async () => {
    mock.mock(devices["iPhone 12"], frameless);

    mock.simulateGetUserMediaError("NotReadableError");

    expect((await query("camera")).state).toBe("granted");
  });

  it("enumerateDevices redacts cameras while camera permission is not granted", async () => {
    mock.mock(devices["Mac Desktop"], frameless);
    mock.setPermissionState("camera", "prompt");

    const listed = await navigator.mediaDevices.enumerateDevices();

    for (const device of listed) {
      if (device.kind === "videoinput") {
        expect(device.label).toBe("");
        expect(device.deviceId).toBe("");
      } else {
        expect(device.label).not.toBe("");
      }
    }
  });

  it("enumerateDevices redacts microphones while microphone permission is not granted", async () => {
    mock.mock(devices["Mac Desktop"], frameless);
    mock.setPermissionState("microphone", "denied");

    const listed = await navigator.mediaDevices.enumerateDevices();

    expect(listed.map((d) => [d.kind, d.label === ""])).toEqual([
      ["videoinput", false],
      ["audioinput", true],
      ["audiooutput", true],
    ]);
  });

  it("unmock resets permissions to granted", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    mock.setPermissionState("camera", "denied");

    mock.unmock();
    mock.mock(devices["iPhone 12"], frameless);

    expect((await query("camera")).state).toBe("granted");
  });

  it("unmock restores navigator.permissions", () => {
    const before = navigator.permissions;
    const nativeQuery = before?.query;

    mock.mock(devices["iPhone 12"], frameless);
    mock.unmock();

    if (before === undefined) {
      expect(navigator.permissions).toBeUndefined();
    } else {
      expect(navigator.permissions.query).toBe(nativeQuery);
    }
  });

  it("permissions: false leaves navigator.permissions alone", () => {
    const before = navigator.permissions;
    const nativeQuery = before?.query;

    mock.mock(devices["iPhone 12"], { ...frameless, permissions: false });

    expect(navigator.permissions).toBe(before);
    expect(navigator.permissions?.query).toBe(nativeQuery);
  });

  it("two instances used one after another keep separate state", async () => {
    const first = createMediaMock();
    first.mock(devices["iPhone 12"], frameless);
    first.setPermissionState("camera", "denied");
    first.unmock();

    const second = createMediaMock();
    second.mock(devices["iPhone 12"], frameless);
    try {
      expect((await query("camera")).state).toBe("granted");
    } finally {
      second.unmock();
    }
  });

  it("does not notify status objects of a previous mock after unmock", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    const status = await query("camera");
    const listener = vi.fn();
    status.addEventListener("change", listener);

    mock.unmock();
    mock.mock(devices["iPhone 12"], frameless);
    mock.setPermissionState("camera", "denied");
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("the permission prompt", () => {
  const mock = createMediaMock();
  const frameless = { frames: false, audio: false } as const;
  const camera = { video: true } as const;

  const query = (name: "camera" | "microphone") =>
    navigator.permissions.query({ name: name as PermissionName });

  const nextChange = (status: PermissionStatus) =>
    new Promise<Event>((resolve) =>
      status.addEventListener("change", resolve, { once: true }),
    );

  /** Whether `promise` is still unsettled after `ms`. */
  async function stillPending(promise: Promise<unknown>, ms = 20) {
    const marker = Symbol("pending");
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve(marker), ms),
    );
    return (
      (await Promise.race([promise.catch(() => undefined), timeout])) === marker
    );
  }

  const rejection = (promise: Promise<unknown>) =>
    promise.then(
      () => {
        throw new Error("expected a rejection");
      },
      (error: DOMException) => error,
    );

  afterEach(() => {
    mock.unmock();
  });

  it("getUserMedia stays pending while the prompt is open", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    mock.setPermissionState("camera", "prompt");

    const pending = navigator.mediaDevices.getUserMedia(camera);

    expect(await mock.waitForPermissionPrompt()).toEqual({
      camera: true,
      microphone: false,
    });
    expect(await stillPending(pending)).toBe(true);
  });

  it("allow resolves the stream and grants camera", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    mock.setPermissionState("camera", "prompt");
    const pending = navigator.mediaDevices.getUserMedia(camera);
    await mock.waitForPermissionPrompt();

    mock.answerPermissionPrompt("allow");
    const stream = await pending;

    expect(stream.getVideoTracks()).toHaveLength(1);
    expect((await query("camera")).state).toBe("granted");
  });

  it("deny rejects NotAllowedError and denies camera", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    mock.setPermissionState("camera", "prompt");
    const pending = navigator.mediaDevices.getUserMedia(camera);
    await mock.waitForPermissionPrompt();

    mock.answerPermissionPrompt("deny");
    const error = await rejection(pending);

    expect(error.name).toBe("NotAllowedError");
    expect(error.message).toBe("Permission denied");
    expect((await query("camera")).state).toBe("denied");

    // No prompt for a later call: it settles by itself.
    await expect(
      navigator.mediaDevices.getUserMedia(camera),
    ).rejects.toMatchObject({ name: "NotAllowedError" });
  });

  it("dismiss rejects NotAllowedError and keeps prompt", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    mock.setPermissionState("camera", "prompt");
    const pending = navigator.mediaDevices.getUserMedia(camera);
    await mock.waitForPermissionPrompt();

    mock.answerPermissionPrompt("dismiss");
    const error = await rejection(pending);

    expect(error.name).toBe("NotAllowedError");
    expect(error.message).toBe("Permission dismissed");
    expect((await query("camera")).state).toBe("prompt");

    void navigator.mediaDevices.getUserMedia(camera).catch(() => undefined);
    expect(await mock.waitForPermissionPrompt()).toEqual({
      camera: true,
      microphone: false,
    });
  });

  it("answerPermissionPrompt throws when no prompt is open", () => {
    mock.mock(devices["iPhone 12"], frameless);

    expect(() => mock.answerPermissionPrompt("allow")).toThrow(
      "No permission prompt is open",
    );
  });

  it("answerPermissionPrompt rejects unknown answers", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    mock.setPermissionState("camera", "prompt");
    void navigator.mediaDevices.getUserMedia(camera).catch(() => undefined);
    await mock.waitForPermissionPrompt();

    expect(() => mock.answerPermissionPrompt("yes" as never)).toThrow(/yes/);
  });

  it("answerPermissionPrompt is chainable", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    mock.setPermissionState("camera", "prompt");
    void navigator.mediaDevices.getUserMedia(camera);
    await mock.waitForPermissionPrompt();

    expect(mock.answerPermissionPrompt("allow")).toBe(mock);
  });

  it("concurrent requests share one prompt", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    mock.setPermissionState("camera", "prompt");
    const first = navigator.mediaDevices.getUserMedia(camera);
    const second = navigator.mediaDevices.getUserMedia(camera);
    await mock.waitForPermissionPrompt();

    mock.answerPermissionPrompt("allow");

    await expect(first).resolves.toBeDefined();
    await expect(second).resolves.toBeDefined();
    expect(await stillPending(mock.waitForPermissionPrompt())).toBe(true);
  });

  it("a PermissionStatus held across the prompt sees the answer", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    mock.setPermissionState("camera", "prompt");
    const status = await query("camera");

    const allowed = navigator.mediaDevices.getUserMedia(camera);
    await mock.waitForPermissionPrompt();
    const granted = nextChange(status);
    mock.answerPermissionPrompt("allow");
    await allowed;
    await granted;
    expect(status.state).toBe("granted");

    mock.setPermissionState("camera", "prompt");
    await nextChange(status);
    const denied = navigator.mediaDevices.getUserMedia(camera);
    await mock.waitForPermissionPrompt();
    const deniedChange = nextChange(status);
    mock.answerPermissionPrompt("deny");
    await denied.catch(() => undefined);
    await deniedChange;
    expect(status.state).toBe("denied");
  });

  it("unmock while a prompt is open settles everything", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    mock.setPermissionState("camera", "prompt");
    const pending = navigator.mediaDevices.getUserMedia(camera);
    await mock.waitForPermissionPrompt();

    const idle = createMediaMock();
    idle.mock(devices["iPhone 12"], frameless);
    const waiting = idle.waitForPermissionPrompt();
    idle.unmock();
    await expect(waiting).rejects.toThrow(
      "MediaMock was unmocked while waiting for a permission prompt",
    );

    mock.unmock();
    const error = await rejection(pending);
    expect(error.name).toBe("AbortError");
    expect(error.message).toBe(
      "getUserMedia was aborted because the mock was removed",
    );

    mock.mock(devices["iPhone 12"], frameless);
    expect((await query("camera")).state).toBe("granted");
    expect(() => mock.answerPermissionPrompt("allow")).toThrow(
      "No permission prompt is open",
    );
  });

  it("denied turns NotFoundError into NotAllowedError", async () => {
    // With audio: false the emulator has no microphone to give.
    mock.mock(devices["iPhone 12"], frameless);
    await expect(
      navigator.mediaDevices.getUserMedia({ audio: true }),
    ).rejects.toMatchObject({ name: "NotFoundError" });

    mock.setPermissionState("microphone", "denied");
    await expect(
      navigator.mediaDevices.getUserMedia({ audio: true }),
    ).rejects.toMatchObject({ name: "NotAllowedError" });

    // Device selection runs before the permission request: no prompt.
    mock.setPermissionState("microphone", "prompt");
    await expect(
      navigator.mediaDevices.getUserMedia({ audio: true }),
    ).rejects.toMatchObject({ name: "NotFoundError" });
    expect(await stillPending(mock.waitForPermissionPrompt())).toBe(true);
  });

  it("OverconstrainedError hides the constraint until a permission is granted", async () => {
    const tooWide = { video: { width: { exact: 99999 } } };
    mock.mock(devices["iPhone 12"], frameless);

    await expect(
      navigator.mediaDevices.getUserMedia(tooWide),
    ).rejects.toMatchObject({
      name: "OverconstrainedError",
      constraint: "width",
    });

    mock.setPermissionState("camera", "prompt");
    mock.setPermissionState("microphone", "prompt");
    await expect(
      navigator.mediaDevices.getUserMedia(tooWide),
    ).rejects.toMatchObject({ name: "OverconstrainedError", constraint: "" });
    expect(await stillPending(mock.waitForPermissionPrompt())).toBe(true);
  });

  it("the simulated error still wins over the prompt", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    mock.setPermissionState("camera", "prompt");
    mock.simulateGetUserMediaError("NotReadableError");

    await expect(
      navigator.mediaDevices.getUserMedia(camera),
    ).rejects.toMatchObject({ name: "NotReadableError" });
    expect(await stillPending(mock.waitForPermissionPrompt())).toBe(true);
  });
});

describe("revoking a permission", () => {
  const mock = createMediaMock();
  const frameless = { frames: false, audio: false } as const;

  const ended = (track: MediaStreamTrack) =>
    new Promise<void>((resolve) =>
      track.addEventListener("ended", () => resolve(), { once: true }),
    );

  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

  afterEach(() => {
    mock.unmock();
  });

  it("revoking camera ends live video tracks", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    const [track] = (
      await navigator.mediaDevices.getUserMedia({ video: true })
    ).getVideoTracks();
    const listener = vi.fn();
    track.addEventListener("ended", listener);

    mock.setPermissionState("camera", "denied");
    await ended(track);
    await settle();

    expect(track.readyState).toBe("ended");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("resetting camera to prompt also ends live video tracks", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    const [track] = (
      await navigator.mediaDevices.getUserMedia({ video: true })
    ).getVideoTracks();

    mock.setPermissionState("camera", "prompt");
    await ended(track);

    expect(track.readyState).toBe("ended");
  });

  it("revoking microphone leaves video tracks live", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    const [track] = (
      await navigator.mediaDevices.getUserMedia({ video: true })
    ).getVideoTracks();

    mock.setPermissionState("microphone", "denied");
    await settle();

    expect(track.readyState).toBe("live");
  });

  it("setting granted again does not end anything", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    const [track] = (
      await navigator.mediaDevices.getUserMedia({ video: true })
    ).getVideoTracks();

    mock.setPermissionState("camera", "granted");
    await settle();

    expect(track.readyState).toBe("live");
  });

  it("changing the state while a prompt is open does not answer it", async () => {
    mock.mock(devices["iPhone 12"], frameless);
    mock.setPermissionState("camera", "prompt");
    const pending = navigator.mediaDevices.getUserMedia({ video: true });
    await mock.waitForPermissionPrompt();

    mock.setPermissionState("microphone", "denied");
    mock.answerPermissionPrompt("allow");

    await expect(pending).resolves.toBeDefined();
  });
});
