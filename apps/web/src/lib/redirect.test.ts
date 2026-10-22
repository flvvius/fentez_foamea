import { describe, expect, it } from "vitest";
import { REDIRECT_TARGETS, safeRedirect } from "./redirect";

describe("safeRedirect", () => {
  it.each(REDIRECT_TARGETS)("keeps %s", (target) => {
    expect(safeRedirect(target)).toBe(target);
  });

  it.each([
    ["backslash host", "/\\evil.com"],
    ["tab then slash", "/\t/evil.com"],
    ["newline then slash", "/\n/evil.com"],
    ["protocol-relative", "//evil.com"],
    ["dot segment", "/.//evil.com"],
    ["parent segment", "/..//evil.com"],
    ["nested parent segment", "/a/..//evil.com"],
    ["encoded dot segment", "/%2e//evil.com"],
    ["absolute url", "https://evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["relative without slash", "evil.com"],
    ["unknown page", "/ok?x=1#h"],
    ["allowed page with suffix", "/harta/../..//evil.com"],
    ["empty", ""],
  ])("rejects %s", (_name, target) => {
    expect(safeRedirect(target)).toBe("/");
  });

  it("handles missing values", () => {
    expect(safeRedirect(undefined)).toBe("/");
    expect(safeRedirect(null)).toBe("/");
  });
});
