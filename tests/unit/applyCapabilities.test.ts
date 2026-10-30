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

  describe("basic constraints", () => {
    /** Applies `constraints` to backCamera, typed loosely like the DOM lib isn't. */
    const apply = (constraints: Record<string, unknown>) =>
      applyToCapabilities(
        constraints as unknown as MediaTrackConstraints,
        backCamera,
      );

    it.each([
      ["an exact value", { zoom: { exact: 99 } }],
      ["a min above the range", { zoom: { min: 5 } }],
      ["a max below the range", { zoom: { max: 0.5 } }],
      [
        "an exact list with no member",
        { whiteBalanceMode: { exact: ["auto"] } },
      ],
      ["an exact feature it lacks", { torch: { exact: true } }],
    ])("should refuse %s the device cannot meet", (_label, constraints) => {
      const device = { ...backCamera, torch: false };
      const out = applyToCapabilities(
        constraints as unknown as MediaTrackConstraints,
        device,
      );

      expect(out.unsatisfiable).toBe(Object.keys(constraints)[0]);
    });

    it("should settle a bare value outside the range on the closest one", () => {
      // A bare value is a preference in a basic constraint set, as in
      // getUserMedia: the device gets as close as it can.
      const out = apply({ zoom: 99 });

      expect(out.unsatisfiable).toBeNull();
      expect(out.settings).toEqual({ zoom: 4 });
    });

    it("should settle an ideal outside the range on the closest one", () => {
      const out = apply({ zoom: { ideal: 0.1 } });

      expect(out.unsatisfiable).toBeNull();
      expect(out.settings).toEqual({ zoom: 1 });
    });

    it("should keep an ideal inside the bounds a min and max allow", () => {
      expect(apply({ zoom: { min: 2, max: 3, ideal: 4 } }).settings).toEqual({
        zoom: 3,
      });
    });

    it("should settle a min on its own bound", () => {
      expect(apply({ zoom: { min: 2 } }).settings).toEqual({ zoom: 2 });
    });

    it("should settle a max on its own bound", () => {
      expect(apply({ zoom: { max: 3 } }).settings).toEqual({ zoom: 3 });
    });

    it("should settle a min below the range on the device's minimum", () => {
      expect(apply({ zoom: { min: 0 } }).settings).toEqual({ zoom: 1 });
    });

    it("should settle a list on its first member the device supports", () => {
      expect(
        apply({ whiteBalanceMode: ["auto", "continuous", "manual"] }).settings,
      ).toEqual({ whiteBalanceMode: "continuous" });
    });

    it("should accept an exact list with a member the device supports", () => {
      expect(
        apply({ whiteBalanceMode: { exact: ["auto", "manual"] } }).settings,
      ).toEqual({ whiteBalanceMode: "manual" });
    });

    it("should settle nothing for a preference the device cannot meet", () => {
      const out = applyToCapabilities(
        { whiteBalanceMode: "auto", torch: true } as MediaTrackConstraints,
        { ...backCamera, torch: false },
      );

      expect(out.unsatisfiable).toBeNull();
      expect(out.settings).toEqual({});
    });
  });

  describe("advanced constraint sets", () => {
    it("should settle a min inside an advanced entry", () => {
      expect(
        applyToCapabilities(
          {
            advanced: [{ zoom: { min: 2 } }],
          } as unknown as MediaTrackConstraints,
          backCamera,
        ).settings,
      ).toEqual({ zoom: 2 });
    });

    it("should settle an advanced ideal on the closest value", () => {
      // Only a bare value turns into exact inside advanced; ideal stays ideal.
      expect(
        applyToCapabilities(
          {
            advanced: [{ zoom: { ideal: 99 } }],
          } as unknown as MediaTrackConstraints,
          backCamera,
        ).settings,
      ).toEqual({ zoom: 4 });
    });
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
