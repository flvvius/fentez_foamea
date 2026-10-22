import { createHash } from "node:crypto";
import type { RateLimitResult } from "../deals/rate-limit";
import { SubmitError } from "./errors";
import { detectImageType, MAX_IMAGE_BYTES, type ImageMime } from "./image-type";
import type { UploadImageResult } from "./types";

export const UPLOAD_ACTION = "upload";
export const UPLOAD_PER_DAY = 20;

export interface UploadTx {
  /** The per-user daily upload limit; records the upload when allowed. */
  rateLimit(): Promise<RateLimitResult>;
  insertImage(image: { userId: string; mimeType: ImageMime; bytes: Uint8Array; sha256: string }): Promise<string>;
}

export type UploadImageDeps = {
  /** An image this user already uploaded with the same content. */
  findExisting: (userId: string, sha256: string) => Promise<string | null>;
  transaction: <T>(run: (tx: UploadTx) => Promise<T>) => Promise<T>;
};

/**
 * Reads at most `maxBytes` from a request body, giving up as soon as the limit is crossed so
 * an oversized upload is never buffered whole. `declaredLength` (Content-Length) rejects it
 * before reading anything, but is only a hint: the stream is counted regardless.
 */
export async function readBodyCapped(
  body: ReadableStream<Uint8Array> | null,
  declaredLength: number | null,
  maxBytes: number = MAX_IMAGE_BYTES,
): Promise<Uint8Array> {
  if (declaredLength !== null && declaredLength > maxBytes) {
    await body?.cancel().catch(() => undefined);
    throw SubmitError.of("image_too_large");
  }
  if (body === null) return new Uint8Array(0);

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw SubmitError.of("image_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Stores an uploaded image. The type comes from the bytes, never from what the client
 * declared. Uploading the same file again returns the existing row, without using the limit.
 */
export async function uploadImageFlow(
  deps: UploadImageDeps,
  userId: string | null,
  bytes: Uint8Array,
): Promise<UploadImageResult> {
  if (!userId) throw SubmitError.of("unauthorized");
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw SubmitError.of("image_too_large");
  const mimeType = detectImageType(bytes);
  if (mimeType === null) throw SubmitError.of("invalid_image");

  const sha256 = sha256Hex(bytes);
  const existing = await deps.findExisting(userId, sha256);
  if (existing) return { imageId: existing };

  return deps.transaction(async (tx) => {
    const limit = await tx.rateLimit();
    if (!limit.allowed) throw SubmitError.rateLimited(limit.retryAfterSeconds);
    return { imageId: await tx.insertImage({ userId, mimeType, bytes, sha256 }) };
  });
}
