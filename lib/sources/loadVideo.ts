/**
 * Creates a hidden, looping, muted `<video>` playing `url`, resolving once the
 * first frame is available.
 *
 * Autoplay being blocked is not treated as a failure: the element still holds
 * decoded frames that `drawImage` can paint, which is all the mock needs.
 */
export async function loadVideo(
  url: string,
  timeoutMs: number = 60 * 1000,
): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.loop = true;
  video.autoplay = true;
  video.hidden = true;
  video.crossOrigin = "anonymous";

  await playVideo(video, timeoutMs);
  return video;
}

function playVideo(
  videoElement: HTMLVideoElement,
  timeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isPromiseSettled = false;

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      videoElement.removeEventListener("loadeddata", onLoadedData);
      videoElement.removeEventListener("error", onError);
    };

    const onLoadedData = async () => {
      if (isPromiseSettled) return;
      isPromiseSettled = true;

      cleanup();

      try {
        await videoElement.play();
        resolve();
      } catch (e: unknown) {
        // Autoplay may be blocked, but the video is loaded either way — frames
        // can still be drawn, so this is a warning rather than a failure.
        console.warn("Video autoplay failed (may be blocked by browser):", e);
        resolve();
      }
    };

    const onError = () => {
      if (isPromiseSettled) return;
      isPromiseSettled = true;

      cleanup();

      console.error(
        "Failed to load video source. Ensure the format is supported and the URL is valid.",
      );
      console.error("Video error details:", {
        error: videoElement.error?.message,
        target: videoElement,
        networkState: videoElement.networkState,
        readyState: videoElement.readyState,
        currentSrc: videoElement.currentSrc,
      });
      reject(new Error(`Video failed to load: ${videoElement.src}`));
    };

    const onTimeout = () => {
      if (isPromiseSettled) return;
      isPromiseSettled = true;

      cleanup();

      reject(
        new Error(`Video loading timed out after ${timeoutMs / 1000} seconds`),
      );
    };

    timeoutId = setTimeout(onTimeout, timeoutMs);

    videoElement.addEventListener("loadeddata", onLoadedData, { once: true });
    videoElement.addEventListener("error", onError, { once: true });

    videoElement.load();
  });
}
