import { describe, expect, it } from "vitest";
import { parseDealsConfig } from "./config";
import { parseCastVoteInput, parseFeedInput, parseMyVotesInput } from "./inputs";

const ID = "11111111-1111-4111-8111-111111111111";

describe("inputs", () => {
  it("accepts valid feed input and rejects bad sort or limit", () => {
    expect(parseFeedInput({ sort: "latest" })).toMatchObject({ sort: "latest" });
    expect(() => parseFeedInput({ sort: "hot" })).toThrow("invalid_input");
    expect(() => parseFeedInput({ sort: "latest", limit: 51 })).toThrow("invalid_input");
    expect(() => parseFeedInput({ sort: "latest", limit: 1.5 })).toThrow("invalid_input");
    expect(() => parseFeedInput(null)).toThrow("invalid_input");
  });

  it("validates castVote input", () => {
    expect(parseCastVoteInput({ dealId: ID, value: -1 })).toEqual({ dealId: ID, value: -1 });
    expect(() => parseCastVoteInput({ dealId: ID, value: 2 })).toThrow("invalid_input");
    expect(() => parseCastVoteInput({ dealId: "nope", value: 1 })).toThrow("invalid_input");
  });

  it("validates fetchMyVotes input", () => {
    expect(parseMyVotesInput({ dealIds: [ID] })).toEqual({ dealIds: [ID] });
    expect(() => parseMyVotesInput({ dealIds: Array(51).fill(ID) })).toThrow("invalid_input");
    expect(() => parseMyVotesInput({ dealIds: ["x"] })).toThrow("invalid_input");
  });
});

describe("parseDealsConfig", () => {
  it("uses defaults", () => {
    expect(parseDealsConfig({})).toEqual({
      hideScore: -5,
      extractPerHour: 10,
      submitPerDay: 5,
      extractDailyBudget: 300,
    });
  });

  it("reads overrides and throws clearly on junk", () => {
    expect(parseDealsConfig({ DEALS_HIDE_SCORE: "-8" }).hideScore).toBe(-8);
    expect(() => parseDealsConfig({ DEALS_HIDE_SCORE: "abc" })).toThrow(/DEALS_HIDE_SCORE/);
    expect(() => parseDealsConfig({ DEALS_SUBMIT_PER_DAY: "0" })).toThrow(/DEALS_SUBMIT_PER_DAY/);
    expect(() => parseDealsConfig({ DEALS_EXTRACT_PER_HOUR: "1.5" })).toThrow(/DEALS_EXTRACT_PER_HOUR/);
  });
});
