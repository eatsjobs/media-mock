import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { devices, MediaMock } from "../lib/main";

describe("warning when a live stream cannot follow a source swap", () => {
  const imageUrl = "/assets/ean8_12345670.png";
  const otherImageUrl = "/assets/florida_dl_front.png";
  const created: HTMLCanvasElement[] = [];
  let warn: ReturnType<typeof vi.spyOn>;

  const canvas = (width = 320, height = 240) => {
    const element = document.createElement("canvas");
    element.width = width;
    element.height = height;
    document.body.append(element);
    created.push(element);
    return element;
  };

  const warnings = () =>
    warn.mock.calls.map((args: unknown[]) => String(args[0])).join("\n");

  beforeEach(() => {
    MediaMock.unmock();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    for (const element of created.splice(0)) element.remove();
  });

  afterAll(() => {
    MediaMock.unmock();
  });

  it("should warn when switching from an image to a canvas mid-stream", async () => {
    MediaMock.mock(devices["Mac Desktop"]);
    await MediaMock.setSource(imageUrl);
    await navigator.mediaDevices.getUserMedia({ video: true });

    await MediaMock.setSource(canvas());

    expect(warnings()).toMatch(/getUserMedia\(\) again/);
  });

  it("should warn when switching from a canvas to an image mid-stream", async () => {
    MediaMock.mock(devices["Mac Desktop"]);
    await MediaMock.setSource(canvas());
    await navigator.mediaDevices.getUserMedia({ video: true });

    await MediaMock.setSource(imageUrl);

    expect(warnings()).toMatch(/getUserMedia\(\) again/);
  });

  it("should warn when switching to a different canvas mid-stream", async () => {
    MediaMock.mock(devices["Mac Desktop"]);
    await MediaMock.setSource(canvas(320, 240));
    await navigator.mediaDevices.getUserMedia({ video: true });

    await MediaMock.setSource(canvas(640, 480));

    expect(warnings()).toMatch(/getUserMedia\(\) again/);
  });

  it("should not warn when swapping between painted sources mid-stream", async () => {
    MediaMock.mock(devices["Mac Desktop"]);
    await MediaMock.setSource(imageUrl);
    await navigator.mediaDevices.getUserMedia({ video: true });

    await MediaMock.setSource(otherImageUrl);

    expect(warnings()).not.toMatch(/getUserMedia\(\) again/);
  });

  it("should not warn when re-setting the same canvas mid-stream", async () => {
    const consumer = canvas();
    MediaMock.mock(devices["Mac Desktop"]);
    await MediaMock.setSource(consumer);
    await navigator.mediaDevices.getUserMedia({ video: true });

    await MediaMock.setSource(consumer);

    expect(warnings()).not.toMatch(/getUserMedia\(\) again/);
  });

  it("should not warn when no stream has been requested yet", async () => {
    MediaMock.mock(devices["Mac Desktop"]);
    await MediaMock.setSource(imageUrl);

    await MediaMock.setSource(canvas());

    expect(warnings()).not.toMatch(/getUserMedia\(\) again/);
  });
});
