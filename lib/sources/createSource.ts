import type { FrameSource } from "./FrameSource";
import { ImageSource } from "./ImageSource";
import { isVideoURL } from "./mediaType";
import { VideoSource } from "./VideoSource";

export interface SourceOptions {
  /** Load timeout, in milliseconds. */
  timeoutMs: number;
  /** Read per frame so a scale-factor change takes effect immediately. */
  scaleFactor: () => number;
}

/**
 * Builds the right source for a media URL: video extensions become a
 * {@link VideoSource}, everything else an {@link ImageSource}.
 */
export function createSourceFromURL(
  url: string,
  { timeoutMs, scaleFactor }: SourceOptions,
): FrameSource {
  return isVideoURL(url)
    ? new VideoSource(url, timeoutMs)
    : new ImageSource(url, timeoutMs, scaleFactor);
}
