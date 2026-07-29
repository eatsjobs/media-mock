import { describe, expect, it } from "vitest";
import { matchResolution, resolveResolution } from "../../lib/resolution";

const iPhoneResolutions = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 640, height: 480 },
  { width: 320, height: 240 },
];

describe("matchResolution", () => {
  it("should return an exact landscape match unchanged in landscape", () => {
    expect(
      matchResolution({
        requested: { width: 1280, height: 720 },
        available: iPhoneResolutions,
        isPortrait: false,
      }),
    ).toEqual({ width: 1280, height: 720 });
  });

  it("should swap an exact landscape match when the device is portrait", () => {
    expect(
      matchResolution({
        requested: { width: 1280, height: 720 },
        available: iPhoneResolutions,
        isPortrait: true,
      }),
    ).toEqual({ width: 720, height: 1280 });
  });

  it("should match a portrait request against the landscape entry and swap it", () => {
    expect(
      matchResolution({
        requested: { width: 1080, height: 1920 },
        available: iPhoneResolutions,
        isPortrait: true,
      }),
    ).toEqual({ width: 1080, height: 1920 });
  });

  it("should fall back to the closest aspect ratio when nothing matches exactly", () => {
    const matched = matchResolution({
      requested: { width: 2560, height: 1440 },
      available: iPhoneResolutions,
      isPortrait: false,
    });

    // 16:9 request → one of the 16:9 entries, not the 4:3 ones
    expect(matched.width / matched.height).toBeCloseTo(16 / 9, 2);
  });

  it("should prefer the closest size among equal aspect ratios", () => {
    expect(
      matchResolution({
        requested: { width: 1300, height: 730 },
        available: iPhoneResolutions,
        isPortrait: false,
      }),
    ).toEqual({ width: 1280, height: 720 });
  });

  // Cases migrated from the browser suite, where they could only assert
  // "defined and greater than zero" because the logic was private.
  it("should snap a 4:3 request to the 4:3 mode closest in size", () => {
    expect(
      matchResolution({
        requested: { width: 800, height: 600 },
        available: iPhoneResolutions,
        isPortrait: false,
      }),
    ).toEqual({ width: 640, height: 480 });
  });

  it("should snap a 16:9 request to the 16:9 mode closest in size", () => {
    expect(
      matchResolution({
        requested: { width: 2560, height: 1440 },
        available: iPhoneResolutions,
        isPortrait: false,
      }),
    ).toEqual({ width: 1920, height: 1080 });
  });

  it("should pick the nearest aspect ratio for an absurdly square request", () => {
    expect(
      matchResolution({
        requested: { width: 99999, height: 99999 },
        available: iPhoneResolutions,
        isPortrait: false,
      }),
    ).toEqual({ width: 640, height: 480 });
  });

  it("should fall back to pixel count for an absurdly wide request", () => {
    // No mode is remotely 50000:1, so every candidate carries a nearly identical
    // aspect penalty and the closest pixel count decides: 320x240 (76,800px) is
    // nearest the requested 50,000px.
    expect(
      matchResolution({
        requested: { width: 50000, height: 1 },
        available: iPhoneResolutions,
        isPortrait: false,
      }),
    ).toEqual({ width: 320, height: 240 });
  });

  it("should return the ultimate fallback when no resolutions are available", () => {
    expect(
      matchResolution({
        requested: { width: 1280, height: 720 },
        available: [],
        isPortrait: false,
      }),
    ).toEqual({ width: 640, height: 480 });
  });

  it("should swap the ultimate fallback in portrait when no resolutions are available", () => {
    expect(
      matchResolution({
        requested: { width: 1280, height: 720 },
        available: [],
        isPortrait: true,
      }),
    ).toEqual({ width: 480, height: 640 });
  });

  it("should not mutate the available resolutions it was given", () => {
    const available = [
      { width: 1920, height: 1080 },
      { width: 640, height: 480 },
    ];
    const snapshot = structuredClone(available);

    matchResolution({
      requested: { width: 800, height: 600 },
      available,
      isPortrait: true,
    });

    expect(available).toEqual(snapshot);
  });
});

describe("resolveResolution", () => {
  it("should read the requested size out of constraints and match it", () => {
    expect(
      resolveResolution(
        { video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
        iPhoneResolutions,
        false,
      ),
    ).toEqual({ width: 1280, height: 720 });
  });

  it("should use the 640x480 default when constraints carry no size", () => {
    expect(
      resolveResolution({ video: true }, iPhoneResolutions, false),
    ).toEqual({
      width: 640,
      height: 480,
    });
  });
});
