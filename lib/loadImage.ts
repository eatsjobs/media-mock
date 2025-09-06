export async function loadImage(imageURL: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = imageURL;
  try {
    await image.decode();
    return image;
  } catch (error: unknown) {
    throw new Error(`Failed to load image: ${imageURL}. Details: ${error}`);
  }
}
