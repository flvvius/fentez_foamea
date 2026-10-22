import { describe, expect, it, vi } from "vitest";
import { handleImageGet, handleImageUpload, type ImageGetDeps, type UploadHandlerDeps } from "./upload-handler";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function upload(
  headers: Record<string, string>,
  opts: { user?: string | null; body?: BodyInit | null } = {},
) {
  const uploadFn = vi.fn(async (_userId: string, _bytes: Uint8Array) => ({ imageId: "img-1" }));
  const deps: UploadHandlerDeps = {
    getUserId: async () => (opts.user === undefined ? "u1" : opts.user),
    upload: uploadFn,
  };
  const request = new Request("http://localhost/api/deal-images", {
    method: "POST",
    headers,
    body: opts.body === undefined ? PNG : opts.body,
  });
  return { response: handleImageUpload(request, deps), uploadFn };
}

describe("handleImageUpload", () => {
  it("stores the bytes for a signed-in same-origin upload", async () => {
    const { response, uploadFn } = upload({ "content-type": "image/png", "sec-fetch-site": "same-origin" });
    const res = await response;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ imageId: "img-1" });
    expect(uploadFn).toHaveBeenCalledWith("u1", PNG);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("accepts a client that sends no Sec-Fetch-Site (not a browser)", async () => {
    expect((await upload({ "content-type": "image/jpeg" }).response).status).toBe(200);
  });

  it("answers 401 unauthorized when signed out, and stores nothing", async () => {
    const { response, uploadFn } = upload({ "content-type": "image/png" }, { user: null });
    const res = await response;
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(uploadFn).not.toHaveBeenCalled();
  });

  it.each(["same-site", "cross-site", "none"])("answers 403 forbidden for Sec-Fetch-Site: %s", async (site) => {
    const { response, uploadFn } = upload({ "content-type": "image/png", "sec-fetch-site": site });
    const res = await response;
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(uploadFn).not.toHaveBeenCalled();
  });

  it.each(["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "application/json", ""])(
    "rejects content-type %j (what a cross-site form can send) with 415",
    async (type) => {
      const { response, uploadFn } = upload(type ? { "content-type": type } : {});
      const res = await response;
      // A body given as bytes gets no content-type from fetch, so "" is exercised too.
      expect(res.status).toBe(415);
      expect(await res.json()).toEqual({ error: "invalid_image" });
      expect(uploadFn).not.toHaveBeenCalled();
    },
  );

  it.each(["image/png", "image/webp; charset=binary", "application/octet-stream", "IMAGE/JPEG"])(
    "accepts content-type %j",
    async (type) => {
      expect((await upload({ "content-type": type }).response).status).toBe(200);
    },
  );

  it("answers 413 when Content-Length is over the limit, without reading", async () => {
    const { response, uploadFn } = upload({ "content-type": "image/png", "content-length": "1572865" });
    const res = await response;
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "image_too_large" });
    expect(uploadFn).not.toHaveBeenCalled();
  });

  it("answers 413 when the body is bigger than it says", async () => {
    const big = new Uint8Array(1_572_864 + 10);
    const { response } = upload({ "content-type": "image/png", "content-length": "10" }, { body: big });
    expect((await response).status).toBe(413);
  });

  it("answers an unexpected failure with a bare internal_error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const deps: UploadHandlerDeps = {
      getUserId: async () => "u1",
      upload: async () => {
        throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
      },
    };
    const res = await handleImageUpload(
      new Request("http://x/api/deal-images", { method: "POST", headers: { "content-type": "image/png" }, body: PNG }),
      deps,
    );
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('{"error":"internal_error"}');
    spy.mockRestore();
  });
});

const SHA = "a".repeat(64);
const ETAG = `"${SHA}"`;

function get(opts: { visible?: boolean; headers?: Record<string, string> } = {}) {
  const loadBytes = vi.fn(async () => PNG);
  const deps: ImageGetDeps = {
    findVisible: async () => (opts.visible === false ? null : { mimeType: "image/png", sha256: SHA }),
    loadBytes,
  };
  const request = new Request("http://localhost/api/deal-images/x", { headers: opts.headers });
  return { response: handleImageGet("x", request, deps), loadBytes };
}

describe("handleImageGet", () => {
  it("serves the bytes with the security headers, a short cache and an ETag", async () => {
    const res = await get().response;
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    expect(Object.fromEntries(res.headers)).toMatchObject({
      "content-type": "image/png",
      "cache-control": "public, max-age=300",
      etag: ETAG,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": "inline",
    });
    expect(res.headers.get("cache-control")).not.toContain("immutable");
  });

  it("answers 404 when no visible deal uses the image", async () => {
    const { response, loadBytes } = get({ visible: false });
    const res = await response;
    expect(res.status).toBe(404);
    expect(loadBytes).not.toHaveBeenCalled();
  });

  it.each([ETAG, `W/${ETAG}`, `"other", ${ETAG}`, "*"])("answers 304 without bytes for If-None-Match: %s", async (value) => {
    const { response, loadBytes } = get({ headers: { "if-none-match": value } });
    const res = await response;
    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe(ETAG);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await res.text()).toBe("");
    expect(loadBytes).not.toHaveBeenCalled();
  });

  it("serves the bytes when If-None-Match is another tag", async () => {
    const res = await get({ headers: { "if-none-match": '"different"' } }).response;
    expect(res.status).toBe(200);
  });

  it("does not reveal an invisible image through If-None-Match", async () => {
    const res = await get({ visible: false, headers: { "if-none-match": "*" } }).response;
    expect(res.status).toBe(404);
  });
});
