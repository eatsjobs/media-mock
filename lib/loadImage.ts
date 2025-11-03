export async function loadImage(
  imageURL: string,
  timeoutMs: number = 60 * 1000,
): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = imageURL;
  try {
    // Race between decode and timeout to prevent hanging indefinitely
    await Promise.race([
      image.decode(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(`Image load timeout after ${timeoutMs / 1000} seconds`),
            ),
          timeoutMs,
        ),
      ),
    ]);
    return image;
  } catch (error: unknown) {
    throw new Error(`Failed to load image: ${imageURL}. Details: ${error}`);
  }
}
