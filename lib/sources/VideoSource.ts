import type { FrameSource } from "./FrameSource";
import { loadVideo } from "./loadVideo";

/**
 * A looping video as the camera feed. Painted to fill the canvas, matching how a
 * real camera fills its output regardless of the source aspect ratio.
 */
export class VideoSource implements FrameSource {
  private video: HTMLVideoElement | undefined;

  constructor(
    private readonly url: string,
    private readonly timeoutMs: number,
  ) {}

  get size(): { width: number; height: number } {
    return {
      width: this.video?.videoWidth ?? 0,
      height: this.video?.videoHeight ?? 0,
    };
  }

  get element(): HTMLElement | undefined {
    return this.video;
  }

  async prepare(): Promise<void> {
    // Not attached to the document: a video element keeps decoding while
    // detached, so the webkit workaround needed for images does not apply.
    this.video = await loadVideo(this.url, this.timeoutMs);
  }

  drawInto(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const video = this.video;
    if (!video) {
      return;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(video, 0, 0, width, height);
  }

  dispose(): void {
    if (!this.video) {
      return;
    }
    this.video.pause();
    this.video.src = "";
    this.video.remove();
    this.video = undefined;
  }
}
