import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DrawingLoop,
  isRAFSupported,
  resolveTimerMode,
  TimerMode,
} from "../../lib/drawingLoop";

const globals = globalThis as unknown as {
  document?: { hidden: boolean };
  requestAnimationFrame?: (cb: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
};

/** Pretends we are in a browser with rAF and a visible (or hidden) page. */
function stubBrowser({ hidden }: { hidden: boolean }) {
  const scheduled: FrameRequestCallback[] = [];
  const cancelled: number[] = [];

  globals.document = { hidden };
  globals.requestAnimationFrame = (cb) => {
    scheduled.push(cb);
    return scheduled.length;
  };
  globals.cancelAnimationFrame = (handle) => {
    cancelled.push(handle);
  };

  return { scheduled, cancelled };
}

afterEach(() => {
  delete globals.document;
  delete globals.requestAnimationFrame;
  delete globals.cancelAnimationFrame;
  vi.useRealTimers();
});

describe("resolveTimerMode", () => {
  it("should pass through the explicit modes untouched", () => {
    stubBrowser({ hidden: false });
    expect(resolveTimerMode(TimerMode.Raf)).toBe(TimerMode.Raf);
    expect(resolveTimerMode(TimerMode.SetInterval)).toBe(TimerMode.SetInterval);
  });

  it("should keep Raf for Auto on a visible page", () => {
    stubBrowser({ hidden: false });
    expect(resolveTimerMode(TimerMode.Auto)).toBe(TimerMode.Raf);
  });

  it("should fall back to setInterval for Auto on a hidden page", () => {
    // Hidden pages get their rAF throttled, which stalls captureStream — the
    // reason Auto exists at all.
    stubBrowser({ hidden: true });
    expect(resolveTimerMode(TimerMode.Auto)).toBe(TimerMode.SetInterval);
  });

  it("should fall back to setInterval for Auto where rAF is unavailable", () => {
    expect(isRAFSupported()).toBe(false);
    expect(resolveTimerMode(TimerMode.Auto)).toBe(TimerMode.SetInterval);
  });

  it("should honor an explicit Raf request even where rAF is unavailable", () => {
    // resolveTimerMode reports intent; the caller checks isRAFSupported before
    // actually scheduling.
    expect(resolveTimerMode(TimerMode.Raf)).toBe(TimerMode.Raf);
  });
});

describe("DrawingLoop with setInterval", () => {
  it("should draw once immediately, before any timer fires", () => {
    vi.useFakeTimers();
    const draw = vi.fn();
    const loop = new DrawingLoop();

    loop.start(draw, { fps: 30, mode: TimerMode.SetInterval });

    expect(draw).toHaveBeenCalledTimes(1);
    loop.stop();
  });

  it("should keep drawing at the requested interval", () => {
    vi.useFakeTimers();
    const draw = vi.fn();
    const loop = new DrawingLoop();

    loop.start(draw, { fps: 10, mode: TimerMode.SetInterval });
    vi.advanceTimersByTime(300); // 3 frames at 10fps

    expect(draw).toHaveBeenCalledTimes(4); // 1 immediate + 3 scheduled
    loop.stop();
  });

  it("should stop drawing after stop()", () => {
    vi.useFakeTimers();
    const draw = vi.fn();
    const loop = new DrawingLoop();

    loop.start(draw, { fps: 10, mode: TimerMode.SetInterval });
    loop.stop();
    vi.advanceTimersByTime(1000);

    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("should report whether it is running", () => {
    vi.useFakeTimers();
    const loop = new DrawingLoop();

    expect(loop.running).toBe(false);
    loop.start(() => {}, { fps: 10, mode: TimerMode.SetInterval });
    expect(loop.running).toBe(true);
    loop.stop();
    expect(loop.running).toBe(false);
  });

  it("should replace a running loop rather than stack a second one", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const loop = new DrawingLoop();

    loop.start(first, { fps: 10, mode: TimerMode.SetInterval });
    loop.start(second, { fps: 10, mode: TimerMode.SetInterval });
    vi.advanceTimersByTime(200);

    expect(first).toHaveBeenCalledTimes(1); // only its immediate draw
    expect(second.mock.calls.length).toBeGreaterThan(1);
    loop.stop();
  });
});

describe("DrawingLoop with requestAnimationFrame", () => {
  it("should draw immediately and schedule a frame", () => {
    const { scheduled } = stubBrowser({ hidden: false });
    const draw = vi.fn();
    const loop = new DrawingLoop();

    loop.start(draw, { fps: 30, mode: TimerMode.Raf });

    expect(draw).toHaveBeenCalledTimes(1);
    expect(scheduled).toHaveLength(1);
    expect(loop.running).toBe(true);
  });

  it("should throttle redraws to the frame rate rather than every frame", () => {
    const { scheduled } = stubBrowser({ hidden: false });
    const draw = vi.fn();
    const loop = new DrawingLoop();

    loop.start(draw, { fps: 1, mode: TimerMode.Raf });
    expect(draw).toHaveBeenCalledTimes(1);

    // Run the scheduled callback immediately: far less than 1000ms has passed,
    // so it reschedules without painting.
    scheduled[scheduled.length - 1](performance.now());

    expect(draw).toHaveBeenCalledTimes(1);
    expect(scheduled.length).toBeGreaterThan(1);
    loop.stop();
  });

  it("should cancel the pending frame on stop()", () => {
    const { cancelled } = stubBrowser({ hidden: false });
    const loop = new DrawingLoop();

    loop.start(() => {}, { fps: 30, mode: TimerMode.Raf });
    loop.stop();

    expect(cancelled).toHaveLength(1);
    expect(loop.running).toBe(false);
  });
});
