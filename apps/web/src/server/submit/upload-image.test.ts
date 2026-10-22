import { describe, expect, it, vi } from "vitest";
import { SubmitError } from "./errors";
import { MAX_IMAGE_BYTES } from "./image-type";
import { readBodyCapped, sha256Hex, uploadImageFlow, type UploadImageDeps } from "./upload-image";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const GIF = new TextEncoder().encode("GIF89a\x01\x00\x01\x00");

function setup(opts: { existing?: string | null; allowed?: boolean } = {}) {
  const insertImage = vi.fn(async (_image: { userId: string; mimeType: string; bytes: Uint8Array; sha256: string }) => "img-new");
  const rateLimit = vi.fn(async () =>
    opts.allowed === false ? { allowed: false, retryAfterSeconds: 77 } : { allowed: true, retryAfterSeconds: 0 },
  );
  const findExisting = vi.fn(async () => opts.existing ?? null);
  const transaction = vi.fn(async (run) => run({ rateLimit, insertImage }));
  return { deps: { findExisting, transaction } as UploadImageDeps, insertImage, rateLimit, findExisting, transaction };
}

async function failure(promise: Promise<unknown>): Promise<SubmitError> {
  try {
    await promise;
  } catch (error) {
    return error as SubmitError;
  }
  throw new Error("expected a SubmitError");
}

describe("uploadImageFlow", () => {
  it("rejects a signed-out caller", async () => {
    const f = setup();
    expect((await failure(uploadImageFlow(f.deps, null, PNG))).message).toBe("unauthorized");
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it("stores the image with the type read from its bytes and its sha256", async () => {
    const f = setup();
    expect(await uploadImageFlow(f.deps, "u1", PNG)).toEqual({ imageId: "img-new" });
    expect(f.insertImage).toHaveBeenCalledWith({ userId: "u1", mimeType: "image/png", bytes: PNG, sha256: sha256Hex(PNG) });
    expect(f.rateLimit).toHaveBeenCalledTimes(1);
  });

  it("knows sha256", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it.each([
    ["gif", GIF],
    ["svg", new TextEncoder().encode("<svg></svg>")],
    ["empty", new Uint8Array(0)],
  ])("rejects %s as invalid_image without using the limit", async (_name, bytes) => {
    const f = setup();
    const error = await failure(uploadImageFlow(f.deps, "u1", bytes));
    expect(error.message).toBe("invalid_image");
    expect(error.status).toBe(415);
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it("rejects an image over 1.5 MB", async () => {
    const f = setup();
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    const error = await failure(uploadImageFlow(f.deps, "u1", big));
    expect(error.message).toBe("image_too_large");
    expect(error.status).toBe(413);
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it("accepts exactly 1.5 MB", async () => {
    const f = setup();
    const exact = new Uint8Array(MAX_IMAGE_BYTES);
    exact.set(PNG);
    await expect(uploadImageFlow(f.deps, "u1", exact)).resolves.toEqual({ imageId: "img-new" });
  });

  it("returns the existing image for the same bytes, without inserting or using the limit", async () => {
    const f = setup({ existing: "img-old" });
    expect(await uploadImageFlow(f.deps, "u1", PNG)).toEqual({ imageId: "img-old" });
    expect(f.findExisting).toHaveBeenCalledWith("u1", sha256Hex(PNG));
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it("does not insert when rate limited", async () => {
    const f = setup({ allowed: false });
    expect((await failure(uploadImageFlow(f.deps, "u1", PNG))).message).toBe("rate_limited:77");
    expect(f.insertImage).not.toHaveBeenCalled();
  });
});

function streamOf(...chunks: Uint8Array[]): { body: ReadableStream<Uint8Array>; pulled: () => number } {
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks[pulled++];
      if (next) controller.enqueue(next);
      else controller.close();
    },
  });
  return { body, pulled: () => pulled };
}

describe("readBodyCapped", () => {
  it("concatenates the chunks", async () => {
    const { body } = streamOf(new Uint8Array([1, 2]), new Uint8Array([3]));
    expect([...(await readBodyCapped(body, null, 10))]).toEqual([1, 2, 3]);
  });

  it("returns empty for no body", async () => {
    expect((await readBodyCapped(null, null, 10)).byteLength).toBe(0);
  });

  it("rejects on Content-Length alone, without reading", async () => {
    const { body, pulled } = streamOf(new Uint8Array(1), new Uint8Array(1), new Uint8Array(1));
    expect((await failure(readBodyCapped(body, 11, 10))).message).toBe("image_too_large");
    // The stream may prefetch one chunk by itself; nothing is read after that.
    expect(pulled()).toBeLessThanOrEqual(1);
  });

  it("stops reading once the stream crosses the limit, whatever Content-Length said", async () => {
    const { body, pulled } = streamOf(new Uint8Array(6), new Uint8Array(6), new Uint8Array(6), new Uint8Array(6));
    expect((await failure(readBodyCapped(body, 3, 10))).message).toBe("image_too_large");
    expect(pulled()).toBeLessThanOrEqual(3);
  });

  it("accepts exactly the limit", async () => {
    const { body } = streamOf(new Uint8Array(5), new Uint8Array(5));
    expect((await readBodyCapped(body, 10, 10)).byteLength).toBe(10);
  });
});
