import { afterEach, describe, expect, it } from "vitest";
import { createMediaMock, devices } from "../lib/main";

/**
 * A real `getUserMedia` refuses a request it cannot serve rather than quietly
 * substituting something else. These pin the refusals the mock owes callers.
 */
describe("unsatisfiable constraints", () => {
  const mock = createMediaMock();

  afterEach(() => {
    mock.unmock();
  });

  it("should reject with a TypeError when neither kind is requested", async () => {
    mock.mock(devices["iPhone 12"]);

    await expect(
      navigator.mediaDevices.getUserMedia({}),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("should reject with a TypeError when both kinds are disabled", async () => {
    mock.mock(devices["iPhone 12"]);

    await expect(
      navigator.mediaDevices.getUserMedia({ video: false, audio: false }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("should reject an exact deviceId no camera has", async () => {
    mock.mock(devices["iPhone 12"]);

    await expect(
      navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: "does-not-exist" } },
      }),
    ).rejects.toMatchObject({
      name: "OverconstrainedError",
      constraint: "deviceId",
    });
  });

  it("should reject an exact facingMode no camera offers", async () => {
    // The Mac Desktop preset has one camera that declares no facingMode at all.
    mock.mock(devices["Mac Desktop"]);

    await expect(
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: "environment" } },
      }),
    ).rejects.toMatchObject({
      name: "OverconstrainedError",
      constraint: "facingMode",
    });
  });

  it("should reject an exact width beyond what the camera can produce", async () => {
    mock.mock(devices["iPhone 12"]);

    await expect(
      navigator.mediaDevices.getUserMedia({
        video: { width: { exact: 99999 }, height: { exact: 99999 } },
      }),
    ).rejects.toMatchObject({
      name: "OverconstrainedError",
      constraint: "width",
    });
  });

  it("should reject an exact frameRate beyond what the camera can produce", async () => {
    mock.mock(devices["iPhone 12"]);

    await expect(
      navigator.mediaDevices.getUserMedia({
        video: { frameRate: { exact: 240 } },
      }),
    ).rejects.toMatchObject({
      name: "OverconstrainedError",
      constraint: "frameRate",
    });
  });

  it("should still serve an ideal value the camera cannot reach", async () => {
    mock.mock(devices["iPhone 12"]);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 99999 } },
    });

    expect(stream.getVideoTracks()).toHaveLength(1);
  });

  it("should serve an exact size the camera supports", async () => {
    mock.mock(devices["iPhone 12"]);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { exact: 1280 }, height: { exact: 720 } },
    });

    expect(stream.getVideoTracks()).toHaveLength(1);
  });

  it("should reject an exact microphone id no device has", async () => {
    mock.mock(devices["iPhone 12"]);

    await expect(
      navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: "does-not-exist" } },
      }),
    ).rejects.toMatchObject({
      name: "OverconstrainedError",
      constraint: "deviceId",
    });
  });

  it("should leave no canvas behind when a request is refused", async () => {
    mock.mock(devices["iPhone 12"]);

    await navigator.mediaDevices
      .getUserMedia({ video: { width: { exact: 99999 } } })
      .catch(() => undefined);

    expect(document.getElementById("media-mock-canvas")).toBeNull();
  });
});
