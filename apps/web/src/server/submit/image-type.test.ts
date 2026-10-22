import { describe, expect, it } from "vitest";
import { detectImageType } from "./image-type";

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const bytes = (...parts: number[][]) => new Uint8Array(parts.flat());

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, ...ascii("JFIF"), 0, 1, 1, 0]);
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii("IHDR")]);
// RIFF size = bytes after the first 8: "WEBP" + "VP8 " + 4 bytes of payload = 12.
const WEBP = bytes(ascii("RIFF"), [12, 0, 0, 0], ascii("WEBP"), ascii("VP8 "), [0, 0, 0, 0]);

describe("detectImageType", () => {
  it("detects jpeg, png and webp", () => {
    expect(detectImageType(JPEG)).toBe("image/jpeg");
    expect(detectImageType(PNG)).toBe("image/png");
    expect(detectImageType(WEBP)).toBe("image/webp");
  });

  it.each([
    ["gif87a", bytes(ascii("GIF87a"), [1, 0, 1, 0])],
    ["gif89a", bytes(ascii("GIF89a"), [1, 0, 1, 0])],
    ["svg", new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ["svg with xml prolog", new TextEncoder().encode('<?xml version="1.0"?><svg></svg>')],
    ["bmp", bytes(ascii("BM"), [0x36, 0, 0, 0])],
    ["html", new TextEncoder().encode("<html><script>alert(1)</script>")],
    ["riff that is not webp (wav)", bytes(ascii("RIFF"), [0x24, 0, 0, 0], ascii("WAVE"))],
    ["truncated jpeg", bytes([0xff, 0xd8])],
    ["truncated png", bytes([0x89, 0x50, 0x4e, 0x47])],
    ["png missing its last signature byte", bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a])],
    ["webp whose RIFF size claims more than the file holds", bytes(ascii("RIFF"), [0x24, 0, 0, 0], ascii("WEBP"), ascii("VP8 "), [0, 0, 0, 0])],
    ["webp with a huge RIFF size", bytes(ascii("RIFF"), [0xff, 0xff, 0xff, 0xff], ascii("WEBP"), ascii("VP8 "), [0, 0, 0, 0])],
    ["jpeg signature alone", bytes([0xff, 0xd8, 0xff])],
    ["11 bytes of jpeg", bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0])],
    ["truncated riff", bytes(ascii("RIFF"), [0, 0, 0, 0], ascii("WEB"))],
    ["empty", new Uint8Array(0)],
  ])("rejects %s", (_name, data) => {
    expect(detectImageType(data)).toBeNull();
  });

  it("accepts a webp whose RIFF size is smaller than the file (trailing data)", () => {
    expect(detectImageType(bytes(ascii("RIFF"), [4, 0, 0, 0], ascii("WEBP"), [9, 9, 9, 9, 9]))).toBe("image/webp");
  });

  it("accepts a 12 byte jpeg", () => {
    expect(detectImageType(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]))).toBe("image/jpeg");
  });

  it("looks at the bytes only: a png stays a png whatever the client called it", () => {
    // The function takes no declared type at all; a caller cannot influence the answer.
    expect(detectImageType.length).toBe(1);
    expect(detectImageType(PNG)).toBe("image/png");
  });
});
