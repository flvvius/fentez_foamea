import { describe, expect, it } from "vitest";
import { collapseWhitespace } from "./text";

describe("collapseWhitespace", () => {
  it("drops invisible joiners and squeezes spaces", () => {
    expect(collapseWhitespace("⁠Ciorbă, Baby!  •\n4 ciorbe​ surpriză ")).toBe("Ciorbă, Baby! • 4 ciorbe surpriză");
  });
});
