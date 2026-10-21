import { describe, expect, it } from "vitest";
import { mergeNodes, richText } from "../src/sveltekit.ts";

describe("sveltekit", () => {
  it("unflattens and merges data nodes", () => {
    const merged = mergeNodes({
      type: "data",
      nodes: [
        { type: "data", data: [{ a: 1 }, "x"] },
        null,
        { type: "data", data: [{ b: 1, c: 2 }, [2], 7] },
      ],
    });
    expect(merged).toEqual({ a: "x", b: [7], c: 7 });
  });

  it("flattens rich text paragraphs", () => {
    const blocks = [
      { type: "paragraph", children: [{ type: "text", text: "Salut " }, { type: "text", text: "lume", bold: true }] },
      { type: "paragraph", children: [{ type: "text", text: "" }] },
      { type: "paragraph", children: [{ type: "text", text: "a doua" }] },
    ];
    expect(richText(blocks)).toBe("Salut lume\na doua");
  });
});
