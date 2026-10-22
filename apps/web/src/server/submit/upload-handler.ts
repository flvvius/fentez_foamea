import { SubmitError } from "./errors";
import type { ImageMeta } from "./store";
import { readBodyCapped } from "./upload-image";
import type { UploadImageResult } from "./types";

// The HTTP layer of the image routes, with its dependencies passed in so it can be tested
// without a database or a session (see image-routes.ts for the real wiring).

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof SubmitError) {
    return json(
      { error: error.message },
      error.status,
      error.retryAfterSeconds === null ? {} : { "retry-after": String(error.retryAfterSeconds) },
    );
  }
  console.error(error);
  return json({ error: "internal_error" }, 500);
}

// A cross-site form can only send text/plain, urlencoded or multipart bodies; anything else
// needs a CORS preflight, which this app never answers. Requiring an image or binary content
// type therefore keeps a third-party page from uploading with the visitor's cookies.
const ACCEPTED_CONTENT_TYPE = /^(image\/[a-z0-9.+-]+|application\/octet-stream)\s*(;|$)/i;

export type UploadHandlerDeps = {
  getUserId: () => Promise<string | null>;
  upload: (userId: string, bytes: Uint8Array) => Promise<UploadImageResult>;
};

/**
 * POST /api/deal-images. The body is the raw image file (not multipart), at most 1.5 MB.
 * 200 { imageId }, or { error: <code> } with the status from errors.ts.
 */
export async function handleImageUpload(request: Request, deps: UploadHandlerDeps): Promise<Response> {
  try {
    // Browsers say where a request came from. Anything but our own pages is refused; clients
    // that send no such header (curl, tests) are not browsers, and cannot ride on a cookie.
    const site = request.headers.get("sec-fetch-site");
    if (site !== null && site !== "same-origin") throw SubmitError.of("forbidden");

    const userId = await deps.getUserId();
    if (!userId) throw SubmitError.of("unauthorized");

    if (!ACCEPTED_CONTENT_TYPE.test(request.headers.get("content-type") ?? "")) {
      throw SubmitError.of("invalid_image");
    }
    const length = request.headers.get("content-length");
    const declared = length !== null && /^\d+$/.test(length) ? Number(length) : null;
    const bytes = await readBodyCapped(request.body, declared);
    return json(await deps.upload(userId, bytes), 200);
  } catch (error) {
    return errorResponse(error);
  }
}

const IMAGE_HEADERS = {
  // Short, and not immutable: a hidden or expired deal's image stops being served within minutes.
  "cache-control": "public, max-age=300",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; sandbox",
  "content-disposition": "inline",
};

export type ImageGetDeps = {
  /** null unless a deal the feed shows uses the image. */
  findVisible: (id: string) => Promise<ImageMeta | null>;
  loadBytes: (id: string) => Promise<Uint8Array | null>;
};

// "If-None-Match" may hold several tags, weak ones, or "*".
function etagMatches(header: string | null, etag: string): boolean {
  if (header === null) return false;
  return header.split(",").some((candidate) => {
    const tag = candidate.trim().replace(/^W\//, "");
    return tag === "*" || tag === etag;
  });
}

const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });

/**
 * GET /api/deal-images/<id>. Only images used by a deal the feed currently shows are served,
 * so an upload that was never posted, or whose deal is hidden or over, is as private as a
 * missing one. The ETag is the content hash; a matching If-None-Match gets a 304 without
 * reading the bytes.
 */
export async function handleImageGet(id: string, request: Request, deps: ImageGetDeps): Promise<Response> {
  try {
    const meta = await deps.findVisible(id);
    if (!meta) return notFound();

    const etag = `"${meta.sha256}"`;
    if (etagMatches(request.headers.get("if-none-match"), etag)) {
      return new Response(null, { status: 304, headers: { ...IMAGE_HEADERS, etag } });
    }
    const bytes = await deps.loadBytes(id);
    if (!bytes) return notFound();
    return new Response(bytes as unknown as BodyInit, {
      status: 200,
      headers: { ...IMAGE_HEADERS, etag, "content-type": meta.mimeType },
    });
  } catch (error) {
    console.error(error);
    return new Response("Internal error", { status: 500, headers: { "cache-control": "no-store" } });
  }
}
