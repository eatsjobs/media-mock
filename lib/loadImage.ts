export async function loadImage(
  imageURL: string,
  timeoutMs: number = 60 * 1000,
): Promise<HTMLImageElement> {
  const image = new Image();
  // Request the image with CORS so a cross-origin source (e.g. a CDN) does not
  // taint the capture canvas — a tainted canvas makes drawImage/captureStream
  // throw a SecurityError. Mirrors the video path in main.ts. Harmless for
  // same-origin and data: URLs; must be set before `src`.
  image.crossOrigin = "anonymous";

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () =>
        reject(
          new Error(`Image load timeout after ${timeoutMs / 1000} seconds`),
        ),
      timeoutMs,
    );
  });

  try {
    // 1. Set src and wait for the network fetch to complete (load event).
    const loadPromise = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = (error: unknown) =>
        reject(new Error(`Failed to load image: ${imageURL}: ${error}`));
    });
    image.src = imageURL;
    await Promise.race([loadPromise, timeout]);

    // 2. Decode the image: ensures pixel data is fully decoded before use.
    //    decode() can be called after load; the browser may have already
    //    started decoding during the fetch.
    await Promise.race([image.decode(), timeout]);

    // 3. Force pixel data into CPU-accessible memory. On some webkit versions,
    //    decode() resolves before the pixel data is ready for canvas drawImage —
    //    a 1×1 warmup draw commits it immediately.
    const warmup = document.createElement("canvas");
    warmup.width = 1;
    warmup.height = 1;
    warmup.getContext("2d")?.drawImage(image, 0, 0, 1, 1);

    return image;
  } catch (error: unknown) {
    throw new Error(`Failed to load image: ${imageURL}. Details: ${error}`);
  } finally {
    // Don't leave the timeout timer pending for up to `timeoutMs` after the
    // image has already loaded (or failed).
    clearTimeout(timeoutId);
  }
}
