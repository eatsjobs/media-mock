import { hideOffscreen } from "../debugView";
import { loadImage } from "../loadImage";
import type { FrameSource } from "./FrameSource";

/** Id given to the source image, so debug tooling can find it. */
export const MEDIA_MOCK_IMAGE_ID = "media-mock-image";

/**
 * A still image as the camera feed. Painted letterboxed into the canvas so the
 * image keeps its aspect ratio whatever resolution was requested.
 */
export class ImageSource implements FrameSource {
  private image: HTMLImageElement | undefined;

  /**
   * @param url image URL
   * @param timeoutMs load timeout
   * @param scaleFactor read per frame, so changing `canvasScaleFactor` between
   * frames takes effect immediately
   */
  constructor(
    private readonly url: string,
    private readonly timeoutMs: number,
    private readonly scaleFactor: () => number,
  ) {}

  get size(): { width: number; height: number } {
    return {
      width: this.image?.naturalWidth ?? 0,
      height: this.image?.naturalHeight ?? 0,
    };
  }

  get element(): HTMLElement | undefined {
    return this.image;
  }

  async prepare(): Promise<void> {
    const image = await loadImage(this.url, this.timeoutMs);
    image.id = MEDIA_MOCK_IMAGE_ID;

    // Attach offscreen before it can paint. Keeping the image in the document
    // stops some webkit versions from evicting its decoded pixel data from GPU
    // memory, which would make drawImage produce blank frames.
    if (typeof document !== "undefined" && document.body) {
      hideOffscreen(image);
      document.body.append(image);
    }

    this.image = image;
  }

  drawInto(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const image = this.image;
    if (!image) {
      return;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    const { naturalWidth, naturalHeight } = image;

    // Guard against a divide by zero on an image that reports no dimensions.
    if (
      naturalHeight === 0 ||
      height === 0 ||
      !Number.isFinite(naturalWidth / naturalHeight) ||
      !Number.isFinite(width / height)
    ) {
      return;
    }

    const imageAspect = naturalWidth / naturalHeight;
    const canvasAspect = width / height;
    const scale = this.scaleFactor();

    let scaledWidth: number;
    let scaledHeight: number;

    if (imageAspect > canvasAspect) {
      // Wider than the canvas: fit to width.
      scaledWidth = width * scale;
      scaledHeight = (width * scale) / imageAspect;
    } else {
      // Taller than the canvas: fit to height.
      scaledHeight = height * scale;
      scaledWidth = height * scale * imageAspect;
    }

    ctx.drawImage(
      image,
      (width - scaledWidth) / 2,
      (height - scaledHeight) / 2,
      scaledWidth,
      scaledHeight,
    );
  }

  dispose(): void {
    if (!this.image) {
      return;
    }
    this.image.remove();
    this.image.src = "";
    this.image = undefined;
  }
}
