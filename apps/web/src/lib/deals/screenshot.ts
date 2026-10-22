// Client-side only (canvas). The pure parts are tested; prepareScreenshot needs a browser.

export const MAX_UPLOAD_BYTES = 1_572_864;
export const MAX_SIDE = 1600;
export const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45] as const;
const MIN_SIDE = 480;

/** Scales (width, height) down so the longest side is at most `max`; never scales up. */
export function fitWithin(width: number, height: number, max: number = MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const ratio = max / longest;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Decodes the picked file, draws it at most 1600px on the long side, and re-encodes it as
 * JPEG at quality 0.85, stepping the quality (then the size) down until it is under 1.5 MB.
 * Throws Error("invalid_image") when the browser can't decode the file, "image_too_large" when
 * nothing small enough could be produced.
 */
export async function prepareScreenshot(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("invalid_image");
  }
  try {
    let { width, height } = fitWithin(bitmap.width, bitmap.height);
    for (;;) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("invalid_image");
      // JPEG has no alpha: paint white first so transparent PNGs don't turn black.
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      for (const quality of QUALITY_STEPS) {
        const blob = await toBlob(canvas, quality);
        if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob;
      }
      if (Math.max(width, height) <= MIN_SIDE) throw new Error("image_too_large");
      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }
  } finally {
    bitmap.close();
  }
}

export type UploadOutcome = { ok: true; imageId: string } | { ok: false; code: string };

/** POSTs the blob to /api/deal-images. `code` is the server's error code ("rate_limited:120", ...). */
export async function uploadScreenshot(blob: Blob): Promise<UploadOutcome> {
  try {
    const response = await fetch("/api/deal-images", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": blob.type },
      body: blob,
    });
    const body = (await response.json().catch(() => null)) as { imageId?: unknown; error?: unknown } | null;
    if (response.ok && typeof body?.imageId === "string") return { ok: true, imageId: body.imageId };
    return { ok: false, code: typeof body?.error === "string" ? body.error : "internal_error" };
  } catch {
    return { ok: false, code: "internal_error" };
  }
}
