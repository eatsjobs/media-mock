import { describe, expect, it } from "vitest";
import { rgbaToNv12 } from "../../lib/nv12";

type RGB = [number, number, number];

/** BT.601 limited range, in floating point: what a camera's ISP produces. */
function reference([r, g, b]: RGB): { y: number; u: number; v: number } {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  return {
    y: 16 + 65.481 * R + 128.553 * G + 24.966 * B,
    u: 128 - 37.797 * R - 74.203 * G + 112 * B,
    v: 128 + 112 * R - 93.786 * G - 18.214 * B,
  };
}

/** An RGBA buffer of `width`×`height`, coloured pixel by pixel. */
function image(
  width: number,
  height: number,
  colourAt: (x: number, y: number) => RGB,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colourAt(x, y);
      rgba.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return rgba;
}

const solid = (colour: RGB) => image(2, 2, () => colour);

describe("rgbaToNv12", () => {
  it("should lay out a full Y plane followed by one interleaved UV plane", () => {
    const nv12 = rgbaToNv12(
      image(4, 2, () => [0, 0, 0]),
      4,
      2,
    );

    // 8 luma samples, then one U,V pair per 2x2 block.
    expect(nv12.length).toBe(4 * 2 + 2 * 2);
  });

  it.each<[string, RGB]>([
    ["white", [255, 255, 255]],
    ["black", [0, 0, 0]],
    ["red", [255, 0, 0]],
    ["green", [0, 255, 0]],
    ["blue", [0, 0, 255]],
    ["grey", [128, 128, 128]],
  ])("should convert %s with BT.601 limited-range coefficients", (_, colour) => {
    const nv12 = rgbaToNv12(solid(colour), 2, 2);
    const expected = reference(colour);

    for (const luma of nv12.subarray(0, 4)) {
      expect(Math.abs(luma - expected.y)).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(nv12[4] - expected.u)).toBeLessThanOrEqual(1);
    expect(Math.abs(nv12[5] - expected.v)).toBeLessThanOrEqual(1);
  });

  it("should keep luma at full resolution", () => {
    // Left column black, right column white.
    const nv12 = rgbaToNv12(
      image(2, 2, (x) => (x === 0 ? [0, 0, 0] : [255, 255, 255])),
      2,
      2,
    );

    expect([...nv12.subarray(0, 4)]).toEqual([16, 235, 16, 235]);
  });

  it("should give each 2x2 block the chroma of its average colour", () => {
    // Left block red, right block blue: one U,V pair each, in that order.
    const nv12 = rgbaToNv12(
      image(4, 2, (x) => (x < 2 ? [255, 0, 0] : [0, 0, 255])),
      4,
      2,
    );
    const [red, blue] = [reference([255, 0, 0]), reference([0, 0, 255])];
    const [uRed, vRed, uBlue, vBlue] = nv12.subarray(8);

    expect(Math.abs(uRed - red.u)).toBeLessThanOrEqual(1);
    expect(Math.abs(vRed - red.v)).toBeLessThanOrEqual(1);
    expect(Math.abs(uBlue - blue.u)).toBeLessThanOrEqual(1);
    expect(Math.abs(vBlue - blue.v)).toBeLessThanOrEqual(1);
  });

  it("should average the four pixels of a block rather than sample one", () => {
    // Two red pixels on top, two black below: the block averages to dark red.
    const nv12 = rgbaToNv12(
      image(2, 2, (_, y) => (y === 0 ? [255, 0, 0] : [0, 0, 0])),
      2,
      2,
    );
    const expected = reference([127.5, 0, 0]);

    expect(Math.abs(nv12[4] - expected.u)).toBeLessThanOrEqual(1);
    expect(Math.abs(nv12[5] - expected.v)).toBeLessThanOrEqual(1);
  });

  it("should write into the buffer it is given, so a frame loop allocates nothing", () => {
    const out = new Uint8Array(6);

    expect(rgbaToNv12(solid([255, 255, 255]), 2, 2, out)).toBe(out);
    expect(out[0]).toBe(235);
  });
});
