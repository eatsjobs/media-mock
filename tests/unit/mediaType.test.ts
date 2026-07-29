import { describe, expect, it } from "vitest";
import { isVideoURL } from "../../lib/sources/mediaType";

describe("isVideoURL", () => {
  it("should detect common video extensions", () => {
    for (const url of [
      "clip.mp4",
      "clip.webm",
      "clip.ogg",
      "clip.mov",
      "clip.mkv",
      "clip.m4v",
      "clip.3gp",
      "clip.mpeg",
    ]) {
      expect(isVideoURL(url), url).toBe(true);
    }
  });

  it("should not treat image extensions as video", () => {
    for (const url of ["frame.png", "frame.jpg", "frame.jpeg", "frame.webp"]) {
      expect(isVideoURL(url), url).toBe(false);
    }
  });

  it("should ignore a query string", () => {
    expect(isVideoURL("/assets/clip.webm?token=abc")).toBe(true);
    expect(isVideoURL("/assets/frame.png?v=2")).toBe(false);
  });

  it("should ignore a fragment", () => {
    expect(isVideoURL("/assets/clip.mp4#t=10")).toBe(true);
  });

  it("should ignore extension casing", () => {
    expect(isVideoURL("/assets/CLIP.MP4")).toBe(true);
  });

  it("should treat an extensionless or data URL as an image", () => {
    expect(isVideoURL("/assets/frame")).toBe(false);
    expect(
      isVideoURL(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgQn2nAAAAABJRU5ErkJggg==",
      ),
    ).toBe(false);
  });
});
