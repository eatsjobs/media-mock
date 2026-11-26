import { describe, expect, it, vi } from "vitest";
import { PermissionController } from "../../lib/permissions";

const cameraOnly = { camera: true, microphone: false } as const;
const microphoneOnly = { camera: false, microphone: true } as const;
const both = { camera: true, microphone: true } as const;

/** Lets queued promise callbacks run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Whether `promise` is still pending after the queue drains. */
async function isPending(promise: Promise<unknown>): Promise<boolean> {
  const marker = Symbol("pending");
  return (await Promise.race([promise, flush().then(() => marker)])) === marker;
}

describe("PermissionController", () => {
  it("starts with both permissions granted", () => {
    const controller = new PermissionController();

    expect(controller.state("camera")).toBe("granted");
    expect(controller.state("microphone")).toBe("granted");
  });

  it("resolves granted without a prompt when every requested kind is granted", async () => {
    const controller = new PermissionController();

    await expect(controller.request(cameraOnly)).resolves.toBe("granted");
    expect(controller.openPrompt).toBeNull();
  });

  it("resolves denied without a prompt when any requested kind is denied", async () => {
    const controller = new PermissionController();
    controller.set("camera", "denied");
    controller.set("microphone", "prompt");

    await expect(controller.request(both)).resolves.toBe("denied");
    expect(controller.openPrompt).toBeNull();
  });

  it("opens one prompt covering only the kinds still in prompt state", async () => {
    const controller = new PermissionController();
    controller.set("microphone", "prompt");

    const outcome = controller.request(both);

    expect(controller.openPrompt).toEqual({ camera: false, microphone: true });
    expect(await isPending(outcome)).toBe(true);
  });

  it("allow grants the prompted kinds and resolves granted", async () => {
    const controller = new PermissionController();
    controller.set("camera", "prompt");
    const outcome = controller.request(cameraOnly);

    controller.answer("allow");

    await expect(outcome).resolves.toBe("granted");
    expect(controller.state("camera")).toBe("granted");
    expect(controller.openPrompt).toBeNull();
  });

  it("deny denies the prompted kinds and resolves denied", async () => {
    const controller = new PermissionController();
    controller.set("camera", "prompt");
    const outcome = controller.request(cameraOnly);

    controller.answer("deny");

    await expect(outcome).resolves.toBe("denied");
    expect(controller.state("camera")).toBe("denied");
  });

  it("dismiss leaves the state at prompt and resolves dismissed", async () => {
    const controller = new PermissionController();
    controller.set("camera", "prompt");
    const outcome = controller.request(cameraOnly);

    controller.answer("dismiss");

    await expect(outcome).resolves.toBe("dismissed");
    expect(controller.state("camera")).toBe("prompt");
  });

  it("waitForPrompt resolves immediately when a prompt is already open", async () => {
    const controller = new PermissionController();
    controller.set("camera", "prompt");
    void controller.request(cameraOnly);

    const prompt = await controller.waitForPrompt();

    expect(prompt).toEqual(cameraOnly);
    expect(structuredClone(prompt)).toEqual(prompt);
  });

  it("waitForPrompt resolves once the next prompt opens", async () => {
    const controller = new PermissionController();
    controller.set("camera", "prompt");
    const waiting = controller.waitForPrompt();
    expect(await isPending(waiting)).toBe(true);

    void controller.request(cameraOnly);

    await expect(waiting).resolves.toEqual(cameraOnly);
  });

  it("waitForPrompt hands out a copy, not the open prompt itself", async () => {
    const controller = new PermissionController();
    controller.set("camera", "prompt");
    void controller.request(cameraOnly);

    const prompt = await controller.waitForPrompt();
    prompt.microphone = true;

    expect(controller.openPrompt).toEqual(cameraOnly);
  });

  it("answer throws when no prompt is open", async () => {
    const controller = new PermissionController();

    expect(() => controller.answer("allow")).toThrow(
      "No permission prompt is open",
    );

    controller.set("camera", "prompt");
    void controller.request(cameraOnly);
    controller.answer("allow");

    expect(() => controller.answer("allow")).toThrow(
      "No permission prompt is open",
    );
  });

  it("answer rejects unknown answers", () => {
    const controller = new PermissionController();
    controller.set("camera", "prompt");
    void controller.request(cameraOnly);

    expect(() => controller.answer("yes" as never)).toThrow(TypeError);
    expect(() => controller.answer("yes" as never)).toThrow(/yes/);
    // The prompt is still open: a bad answer is not an answer.
    expect(controller.openPrompt).toEqual(cameraOnly);
  });

  it("queues concurrent requests and re-evaluates them after the answer", async () => {
    const controller = new PermissionController();
    controller.set("camera", "prompt");
    const first = controller.request(cameraOnly);
    const second = controller.request(cameraOnly);

    expect(controller.openPrompt).toEqual(cameraOnly);
    controller.answer("allow");

    await expect(first).resolves.toBe("granted");
    await expect(second).resolves.toBe("granted");
    expect(controller.openPrompt).toBeNull();
  });

  it("a queued request is denied once the open prompt is denied", async () => {
    const controller = new PermissionController();
    controller.set("camera", "prompt");
    const first = controller.request(cameraOnly);
    const second = controller.request(cameraOnly);

    controller.answer("deny");

    await expect(first).resolves.toBe("denied");
    await expect(second).resolves.toBe("denied");
  });

  it("a queued request for another kind gets its own prompt after the first is answered", async () => {
    const controller = new PermissionController();
    controller.set("camera", "prompt");
    controller.set("microphone", "prompt");
    const camera = controller.request(cameraOnly);
    const microphone = controller.request(microphoneOnly);

    expect(controller.openPrompt).toEqual(cameraOnly);
    controller.answer("allow");

    await expect(camera).resolves.toBe("granted");
    expect(controller.openPrompt).toEqual({ camera: false, microphone: true });
    expect(await isPending(microphone)).toBe(true);
  });

  it("subscribe is notified on change but not when the value is unchanged", () => {
    const controller = new PermissionController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.set("camera", "granted");
    expect(listener).not.toHaveBeenCalled();

    controller.set("camera", "prompt");
    controller.set("microphone", "prompt");
    expect(listener.mock.calls).toEqual([["camera"], ["microphone"]]);

    listener.mockClear();
    void controller.request(both);
    controller.answer("allow");
    expect(listener.mock.calls).toEqual([["camera"], ["microphone"]]);

    listener.mockClear();
    unsubscribe();
    controller.set("camera", "denied");
    expect(listener).not.toHaveBeenCalled();
  });

  it("reset aborts pending requests, rejects waiters and restores granted", async () => {
    const controller = new PermissionController();
    controller.set("camera", "prompt");
    controller.set("microphone", "denied");
    const open = controller.request(cameraOnly);
    const queued = controller.request(cameraOnly);

    controller.reset();

    await expect(open).resolves.toBe("aborted");
    await expect(queued).resolves.toBe("aborted");
    expect(controller.state("camera")).toBe("granted");
    expect(controller.state("microphone")).toBe("granted");
    expect(controller.openPrompt).toBeNull();

    const idle = new PermissionController();
    const waiting = idle.waitForPrompt();
    idle.reset();
    await expect(waiting).rejects.toThrow(
      "MediaMock was unmocked while waiting for a permission prompt",
    );
  });
});
