import { describe, expect, it } from "vitest";
import { applyToCapabilities } from "../../lib/applyCapabilities";

const backCamera = {
  torch: true,
  zoom: { min: 1, max: 4 },
  whiteBalanceMode: ["manual", "continuous"],
  width: { min: 1, max: 4032 },
};

describe("applyToCapabilities", () => {
  it("should settle a boolean capability the device advertises", () => {
    const out = applyToCapabilities(
      { advanced: [{ torch: true }] } as unknown as MediaTrackConstraints,
      backCamera,
    );

    expect(out.settings).toEqual({ torch: true });
    expect(out.remainder).toBeNull();
    expect(out.unsatisfiable).toBeNull();
  });

  it("should settle a value inside an advertised range", () => {
    expect(
      applyToCapabilities(
        { advanced: [{ zoom: 2 }] } as unknown as MediaTrackConstraints,
        backCamera,
      ).settings,
    ).toEqual({ zoom: 2 });
  });

  it("should skip an advanced entry the device cannot meet", () => {
    // `advanced` is best effort: an entry that cannot be met is dropped, not
    // an error.
    const out = applyToCapabilities(
      { advanced: [{ zoom: 99 }] } as unknown as MediaTrackConstraints,
      backCamera,
    );

    expect(out.settings).toEqual({});
    expect(out.unsatisfiable).toBeNull();
  });

  it("should never forward advanced entries to the browser", () => {
    // A capture track refuses every one of them.
    expect(
      applyToCapabilities(
        {
          advanced: [{ somethingElse: 1 }],
        } as unknown as MediaTrackConstraints,
        backCamera,
      ).remainder,
    ).toBeNull();
  });

  it("should refuse a basic constraint the device cannot meet", () => {
    expect(
      applyToCapabilities(
        { zoom: 99 } as unknown as MediaTrackConstraints,
        backCamera,
      ).unsatisfiable,
    ).toBe("zoom");
  });

  it("should leave a constraint the device does not speak for to the browser", () => {
    const out = applyToCapabilities({ frameRate: 15 }, backCamera);

    expect(out.settings).toEqual({});
    expect(out.remainder).toEqual({ frameRate: 15 });
  });

  it("should unwrap exact and ideal", () => {
    expect(
      applyToCapabilities(
        {
          advanced: [{ zoom: { exact: 3 } }],
        } as unknown as MediaTrackConstraints,
        backCamera,
      ).settings,
    ).toEqual({ zoom: 3 });
  });

  it("should accept a member of an advertised list", () => {
    expect(
      applyToCapabilities(
        {
          advanced: [{ whiteBalanceMode: "manual" }],
        } as unknown as MediaTrackConstraints,
        backCamera,
      ).settings,
    ).toEqual({ whiteBalanceMode: "manual" });
  });

  it("should allow turning an advertised feature off", () => {
    expect(
      applyToCapabilities(
        { advanced: [{ torch: false }] } as unknown as MediaTrackConstraints,
        backCamera,
      ).settings,
    ).toEqual({ torch: false });
  });

  it("should not claim a feature the device never advertised", () => {
    expect(
      applyToCapabilities(
        { advanced: [{ torch: true }] } as unknown as MediaTrackConstraints,
        { zoom: { min: 1, max: 2 } },
      ).settings,
    ).toEqual({});
  });
});
