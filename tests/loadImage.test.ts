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
});
