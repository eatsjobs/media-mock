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
