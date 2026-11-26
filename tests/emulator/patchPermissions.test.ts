import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionsPatcher } from "../../lib/patchPermissions";
import type { MediaPermissionName } from "../../lib/permissions";

/**
 * happy-dom has a native `Permissions.prototype.query` to replace; jsdom has
 * no `navigator.permissions` at all, so there one is synthesized. Both paths
 * are exercised, one per emulator project.
 */
describe("PermissionsPatcher", () => {
  let patcher: PermissionsPatcher;
  let states: Record<MediaPermissionName, PermissionState>;
  const read = (name: MediaPermissionName) => states[name];

  const query = (name: string) =>
    navigator.permissions.query({ name: name as PermissionName });

  const nextChange = (status: PermissionStatus) =>
    new Promise<Event>((resolve) =>
      status.addEventListener("change", resolve, { once: true }),
    );

  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

  beforeEach(() => {
    patcher = new PermissionsPatcher();
    states = { camera: "granted", microphone: "granted" };
  });

  afterEach(() => {
    patcher.restore();
  });

  it("query reports the state read at call time for camera and microphone", async () => {
    patcher.install(read);
    states.camera = "prompt";
    states.microphone = "denied";

    const camera = await query("camera");
    const microphone = await query("microphone");

    expect(camera.state).toBe("prompt");
    expect(camera.name).toBe("camera");
    expect(microphone.state).toBe("denied");
    expect(microphone.name).toBe("microphone");
  });

  it("each query returns a new status object", async () => {
    patcher.install(read);

    expect(await query("camera")).not.toBe(await query("camera"));
  });

  it("notify fires change on every live status with the new state", async () => {
    patcher.install(read);
    const a = await query("camera");
    const b = await query("camera");
    const onchange = vi.fn();
    a.onchange = onchange;

    states.camera = "denied";
    patcher.notify("camera");
    // The spec queues a task: nothing has changed yet.
    expect(a.state).toBe("granted");

    await nextChange(a);

    expect(a.state).toBe("denied");
    expect(b.state).toBe("denied");
    expect(onchange).toHaveBeenCalledTimes(1);
  });

  it("notify does not fire when the state is unchanged", async () => {
    patcher.install(read);
    const status = await query("camera");
    const listener = vi.fn();
    status.addEventListener("change", listener);

    patcher.notify("camera");
    await settle();

    expect(listener).not.toHaveBeenCalled();
  });

  it("notify for camera does not touch microphone statuses", async () => {
    patcher.install(read);
    const microphone = await query("microphone");
    const listener = vi.fn();
    microphone.addEventListener("change", listener);

    states.camera = "denied";
    states.microphone = "denied";
    patcher.notify("camera");
    await settle();

    expect(listener).not.toHaveBeenCalled();
    expect(microphone.state).toBe("granted");
  });

  it("collapses several changes before the task runs into one event", async () => {
    patcher.install(read);
    const status = await query("camera");
    const listener = vi.fn();
    status.addEventListener("change", listener);

    states.camera = "prompt";
    patcher.notify("camera");
    states.camera = "denied";
    patcher.notify("camera");
    await settle();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(status.state).toBe("denied");
  });

  it("unknown names reject with TypeError when there is no native query", async () => {
    const hadNative = navigator.permissions !== undefined;
    patcher.install(read);

    if (hadNative) {
      // Forwarded to the emulator's own implementation instead.
      await expect(query("geolocation")).resolves.toBeDefined();
    } else {
      await expect(query("geolocation")).rejects.toThrow(TypeError);
    }
  });

  it("synthesizes navigator.permissions where it is missing and removes it on restore", () => {
    const before = navigator.permissions;
    const nativeQuery = before?.query;

    patcher.install(read);
    expect(navigator.permissions).toBeDefined();
    expect(typeof navigator.permissions.query).toBe("function");

    patcher.restore();
    if (before === undefined) {
      expect(navigator.permissions).toBeUndefined();
    } else {
      expect(navigator.permissions.query).toBe(nativeQuery);
    }
  });

  it("installing twice keeps the native query restorable", () => {
    const nativeQuery = navigator.permissions?.query;

    patcher.install(read);
    patcher.install(read);
    patcher.restore();

    expect(navigator.permissions?.query).toBe(nativeQuery);
  });

  it("overlapping patchers restored out of order keep query working and restore the native at the end", async () => {
    const before = navigator.permissions;
    const nativeQuery = before?.query;
    const other = new PermissionsPatcher();
    const otherStates: Record<MediaPermissionName, PermissionState> = {
      camera: "denied",
      microphone: "granted",
    };
    states.camera = "prompt";

    patcher.install(read);
    other.install((name) => otherStates[name]);
    // The last to install answers.
    expect((await query("camera")).state).toBe("denied");

    // The first leaves while the second is still mocking.
    patcher.restore();
    expect((await query("camera")).state).toBe("denied");
    if (before === undefined) {
      await expect(query("geolocation")).rejects.toThrow(TypeError);
    } else {
      await expect(query("geolocation")).resolves.toBeDefined();
    }

    other.restore();
    if (before === undefined) {
      expect(navigator.permissions).toBeUndefined();
    } else {
      expect(navigator.permissions.query).toBe(nativeQuery);
    }
  });

  it("reports whether it is installed", () => {
    expect(patcher.installed).toBe(false);
    patcher.install(read);
    expect(patcher.installed).toBe(true);
    patcher.restore();
    expect(patcher.installed).toBe(false);
  });
});
