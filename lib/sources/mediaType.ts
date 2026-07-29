/**
 * Deciding whether a media URL points at a video or an image.
 *
 * No DOM access: unit-tested in node.
 */

const VIDEO_EXTENSIONS = [
  "mp4",
  "webm",
  "ogg",
  "mov",
  "avi",
  "mkv",
  "flv",
  "wmv",
  "m4v",
  "3gp",
  "mpg",
  "mpeg",
  "asf",
  "rm",
  "vob",
];

/**
 * Whether the URL should be loaded as a video. Anything unrecognised — no
 * extension, a `data:` URL, an image extension — is treated as an image.
 *
 * @param url media URL, optionally carrying a query string or fragment
 */
export function isVideoURL(url: string): boolean {
  // Strip query string and fragment so "clip.mp4?token=abc" still resolves to
  // the "mp4" extension.
  const extension = url.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  return VIDEO_EXTENSIONS.includes(extension ?? "");
}
