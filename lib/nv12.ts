/**
 * Converts canvas pixels (RGBA) to NV12 in BT.601 limited range — the layout and
 * colour space most cameras deliver: a full-resolution Y plane, then one plane
 * of interleaved U,V pairs, one pair per 2x2 block of pixels.
 *
 * `width` and `height` must be even. Pass `out` to reuse a buffer across frames.
 *
 * No DOM access: unit-tested in node.
 */
export function rgbaToNv12(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  out: Uint8Array = new Uint8Array(width * height * 1.5),
): Uint8Array {
  let uv = width * height;

  for (let row = 0; row < height; row += 2) {
    for (let col = 0; col < width; col += 2) {
      // Sums over the block's four pixels, for its one chroma sample.
      let r = 0;
      let g = 0;
      let b = 0;

      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const pixel = (row + dy) * width + col + dx;
          const red = rgba[pixel * 4];
          const green = rgba[pixel * 4 + 1];
          const blue = rgba[pixel * 4 + 2];
          out[pixel] = ((66 * red + 129 * green + 25 * blue + 128) >> 8) + 16;
          r += red;
          g += green;
          b += blue;
        }
      }

      // The sums are four pixels' worth, hence >> 10 rather than >> 8.
      out[uv++] = ((-38 * r - 74 * g + 112 * b + 512) >> 10) + 128;
      out[uv++] = ((112 * r - 94 * g - 18 * b + 512) >> 10) + 128;
    }
  }

  return out;
}
