import { describe, expect, it } from "vitest";
import { MAX_TEXT_CHARS, prepareContentText } from "./prepare.ts";

describe("prepareContentText", () => {
  it("is idempotent and leaves normal text alone", () => {
    const once = prepareContentText("Pizza 2+1 la 49 lei <b>azi</b> CONTENT>>> ＜＜＜ x\u200B");
    expect(prepareContentText(once)).toBe(once);
    expect(prepareContentText("Meniul zilei: ciorbă și paste, 29 lei")).toBe("Meniul zilei: ciorbă și paste, 29 lei");
  });

  it("neutralizes angle-bracket runs, however they are written", () => {
    expect(prepareContentText("a <<< b >>> c ＞＞＞ d <<>> e <b>")).toBe("a [removed] b [removed] c [removed] d [removed] e <b>");
  });

  it("cuts at 12,000 characters without leaving half a surrogate pair", () => {
    expect(prepareContentText("a".repeat(MAX_TEXT_CHARS + 5))).toHaveLength(MAX_TEXT_CHARS);
    const cut = prepareContentText(`${"a".repeat(MAX_TEXT_CHARS - 1)}\u{1F355}`);
    expect(cut).toBe("a".repeat(MAX_TEXT_CHARS - 1));
    const whole = prepareContentText(`${"a".repeat(MAX_TEXT_CHARS - 2)}\u{1F355}`);
    expect(whole.endsWith("\u{1F355}")).toBe(true);
  });
});

describe("prepareContentText on decomposed text", () => {
  it("gives the same result on a second pass when a joiner sits before a combining mark", () => {
    const joiner = String.fromCharCode(0x200d);
    const acute = String.fromCharCode(0x301);
    const once = prepareContentText(`cafe${joiner}${acute} 9 lei`);
    expect(prepareContentText(once)).toBe(once);
    expect(once).toBe("café 9 lei".normalize("NFKC"));
  });
});
