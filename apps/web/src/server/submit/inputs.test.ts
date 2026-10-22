import { describe, expect, it } from "vitest";
import { parseExtractImageInput, parseExtractUrlInput, parseSubmitDealInput } from "./inputs";

const IMAGE = "11111111-1111-4111-8111-111111111111";

describe("parseExtractUrlInput", () => {
  it("accepts a string up to 2048 characters", () => {
    expect(parseExtractUrlInput({ url: "https://a.ro" })).toEqual({ url: "https://a.ro" });
    expect(() => parseExtractUrlInput({ url: "x".repeat(2049) })).toThrow("invalid_input");
  });
  it.each([null, "x", [], { url: 1 }, {}])("rejects %j", (data) => {
    expect(() => parseExtractUrlInput(data)).toThrow("invalid_input");
  });
});

describe("parseExtractImageInput", () => {
  it("normalizes the optional fields", () => {
    expect(parseExtractImageInput({ imageId: IMAGE.toUpperCase() })).toEqual({ imageId: IMAGE, caption: null, postedAt: null });
    expect(parseExtractImageInput({ imageId: IMAGE, caption: "  hi ", postedAt: "2026-10-20T09:00:00+02:00" })).toEqual({
      imageId: IMAGE,
      caption: "hi",
      postedAt: "2026-10-20T07:00:00.000Z",
    });
    expect(parseExtractImageInput({ imageId: IMAGE, caption: "  ", postedAt: null }).caption).toBeNull();
  });
  it("rejects a bad id, a long caption or a bad date", () => {
    expect(() => parseExtractImageInput({ imageId: "nope" })).toThrow("invalid_input");
    expect(() => parseExtractImageInput({ imageId: IMAGE, caption: "x".repeat(2001) })).toThrow("invalid_input");
    expect(() => parseExtractImageInput({ imageId: IMAGE, postedAt: "yesterday-ish" })).toThrow("invalid_input");
  });
});

describe("parseSubmitDealInput", () => {
  it("treats a missing or blank source as null, and leaves the draft for the flow to validate", () => {
    expect(parseSubmitDealInput({ draft: { a: 1 }, sourceUrl: "  ", imageId: "" })).toEqual({
      draft: { a: 1 },
      sourceUrl: null,
      imageId: null,
      extraction: null,
    });
  });
  it("accepts extraction metadata", () => {
    expect(
      parseSubmitDealInput({ draft: {}, imageId: IMAGE, extraction: { source: "image", confidence: 0.4, evidenceSnippet: "x" } }),
    ).toMatchObject({ imageId: IMAGE, extraction: { source: "image", confidence: 0.4, evidenceSnippet: "x" } });
  });
  it.each([
    { draft: {}, sourceUrl: 5 },
    { draft: {}, imageId: "nope" },
    { draft: {}, extraction: { source: "robot" } },
    { draft: {}, extraction: { source: "text", confidence: "high" } },
    "x",
  ])("rejects %j", (data) => {
    expect(() => parseSubmitDealInput(data)).toThrow("invalid_input");
  });
});
