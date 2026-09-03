import { describe, expect, it } from "vitest";
import { loadImage } from "../lib/loadImage";

describe("loadImage", () => {
  const imageUrl = "/assets/ean8_12345670.png";

  it("requests the image with crossOrigin 'anonymous' so the capture canvas is not tainted by cross-origin sources", async () => {
    const image = await loadImage(imageUrl);
    expect(image.crossOrigin).toBe("anonymous");
  });

  it("still resolves to a fully loaded, decodable image", async () => {
    const image = await loadImage(imageUrl);
    expect(image.complete).toBe(true);
    expect(image.naturalWidth).toBeGreaterThan(0);
  });

  it("should resolve an image that loaded and draws even when decode() rejects", async () => {
    // WebKit on Linux rejects decode() with EncodingError on a 1x1 image that
    // loaded fine and that drawImage handles — which is exactly the shape of
    // the default placeholder source.
    const nativeDecode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = () =>
      Promise.reject(new DOMException("Decoding error.", "EncodingError"));

    try {
      const image = await loadImage(imageUrl);

      expect(image.complete).toBe(true);
      expect(image.naturalWidth).toBeGreaterThan(0);
    } finally {
      HTMLImageElement.prototype.decode = nativeDecode;
    }
  });

  it("should still reject an image that never loads", async () => {
    await expect(loadImage("/assets/does-not-exist.png")).rejects.toThrow(
      /Failed to load image/,
    );
  });
});
