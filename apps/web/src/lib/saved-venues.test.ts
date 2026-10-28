import { describe, expect, it } from "vitest";
import { parseSaved, toggled } from "./saved-venues";

describe("saved venues", () => {
  it("reads only string ids and survives bad storage", () => {
    expect(parseSaved('["a", 3, "b"]')).toEqual(["a", "b"]);
    expect(parseSaved("{")).toEqual([]);
    expect(parseSaved('{"a":1}')).toEqual([]);
    expect(parseSaved(null)).toEqual([]);
  });

  it("adds new venues first and removes saved ones", () => {
    expect(toggled(["a"], "b")).toEqual(["b", "a"]);
    expect(toggled(["b", "a"], "b")).toEqual(["a"]);
  });
});
