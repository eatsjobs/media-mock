import type { CaptureSurface } from "./captureSurface";
import { rgbaToNv12 } from "./nv12";
import type { Resolution } from "./resolution";
import type { FrameSource } from "./sources/FrameSource";
import { ImageSource } from "./sources/ImageSource";

/**
 * How the mocked camera's frames reach the page.
 */
export enum FrameOutput {
  /**
   * Paint a canvas and capture it with `captureStream()`. Works everywhere, but
   * frames arrive as BGRA, where a real camera delivers YUV.
   */
  Canvas = "canvas",
  /**
   * Write NV12 `VideoFrame`s into a `MediaStreamTrackGenerator`, the format a
   * real camera delivers. Chrome and Edge only; elsewhere, for a canvas the
   * consumer renders itself, and for odd frame sizes this falls back to
   * {@link FrameOutput.Canvas}.
   *
   * Safari's worker-only `VideoTrackGenerator` is deliberately not used: in
   * Safari 27.2 a `<video>` playing its track keeps presenting the first frame
   * to `drawImage` and `new VideoFrame(video)`, whatever is written after it.
   */
  VideoFrameNV12 = "videoFrameNV12",
}

/** A generator track and the means to feed it NV12 frames. */
export interface Nv12Output {
  readonly track: MediaStreamTrack;
  /** Emits `frame` — the NV12 bytes are copied, so the buffer can be reused. */
  write(frame: Uint8Array): void;
}

/** Chrome's breakout-box generator; not in TypeScript's DOM types. */
type TrackGenerator = MediaStreamTrack & {
  readonly writable: WritableStream<VideoFrame>;
};
type TrackGeneratorConstructor = new (init: {
  kind: "video";
}) => TrackGenerator;

/**
 * Opens an NV12 output at `size`, or returns null where this browser cannot
 * generate one, so the caller falls back to canvas capture.
 */
export function openNv12Output(
  { width, height }: Resolution,
  fps: number,
): Nv12Output | null {
  const Generator = (
    globalThis as { MediaStreamTrackGenerator?: TrackGeneratorConstructor }
  ).MediaStreamTrackGenerator;
  // One chroma sample per 2x2 block: odd sizes are padded or refused.
  if (typeof Generator !== "function" || width % 2 || height % 2) {
    return null;
  }

  const generator = new Generator({ kind: "video" });
  const writer = generator.writable.getWriter();
  let writing = false;

  // The generator reports 30 whatever it is fed; a camera reports the rate it
  // was opened at.
  const getSettings = generator.getSettings.bind(generator);
  generator.getSettings = () => ({ ...getSettings(), frameRate: fps });

  return {
    track: generator,
    write(frame) {
      // Drop the tick rather than queue frames behind a slow consumer.
      if (writing) {
        return;
      }
      writing = true;
      const videoFrame = new VideoFrame(frame, {
        format: "NV12",
        codedWidth: width,
        codedHeight: height,
        timestamp: Math.round(performance.now() * 1000),
      });
      writer
        .write(videoFrame)
        .catch(() => videoFrame.close())
        .finally(() => {
          writing = false;
        });
    },
  };
}

/**
 * Builds the per-tick step that paints `source` and writes it to `output`.
 *
 * Converting is the expensive part, so a still image is converted again only
 * when its picture changes — a new scale factor. Any other source may change
 * between frames, so it is converted every tick.
 */
export function nv12Tick(
  source: FrameSource,
  surface: CaptureSurface,
  ctx: CanvasRenderingContext2D,
  output: Nv12Output,
  scaleFactor: () => number,
): () => void {
  const { width, height } = surface.resolution;
  const buffer = new Uint8Array(width * height * 1.5);
  let convertedAtScale: number | undefined;

  return () => {
    // The loop outlives a track the consumer stopped; converting is wasted then.
    if (output.track.readyState === "ended") {
      return;
    }
    const scale = scaleFactor();
    if (!(source instanceof ImageSource) || scale !== convertedAtScale) {
      surface.paint(source);
      const { data } = ctx.getImageData(0, 0, width, height);
      rgbaToNv12(data, width, height, buffer);
      convertedAtScale = scale;
    }
    output.write(buffer);
  };
}
