export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

/** The database CHECK on deal_images.byte_size. */
export const MAX_IMAGE_BYTES = 1_572_864;

// No real image is smaller than a header: a PNG signature plus its first chunk length alone is 12 bytes.
const MIN_IMAGE_BYTES = 12;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);
}

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/**
 * The image type from the file's own bytes. The type the client declares is never consulted:
 * it decides what we later serve as content-type. Only JPEG, PNG and WebP are accepted, so
 * SVG (script), GIF, BMP and everything else come back null.
 */
export function detectImageType(bytes: Uint8Array): ImageMime | null {
  if (bytes.length < MIN_IMAGE_BYTES) return null;
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, PNG)) return "image/png";
  // RIFF <4-byte little-endian size> WEBP: the size counts the bytes after the first 8, so a
  // file shorter than it declares is truncated or forged.
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) {
    const size = (bytes[4]! | (bytes[5]! << 8) | (bytes[6]! << 16) | (bytes[7]! << 24)) >>> 0;
    return size <= bytes.length - 8 ? "image/webp" : null;
  }
  return null;
}
