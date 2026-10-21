import { describe, expect, it } from "vitest";
import { dateRangeToIso, detectConditions, findLeiPrice, parseDateRange, parseWeekdays, truncate } from "../src/romanian.ts";

describe("parseWeekdays", () => {
  it.each([
    ["Dacă-i miercuri, e Burrito Day.", [3]],
    ["Dacă e marți, e Taco Tuesday!", [2]],
    ["Săptămâna începe bine cu #luneacalumea", [1]],
    ["Miercuri și joi ai 1+1 din partea casei", [3, 4]],
    ["Marți Bucket e în meniu de luni până vineri", [1, 2, 3, 4, 5]],
    ["valabil luni - joi", [1, 2, 3, 4]],
    ["Sâmbătă și duminică", [6, 7]],
  ])("reads %s", (text, expected) => {
    expect(parseWeekdays(text)).toEqual(expected);
  });

  it("ignores durations and full weeks", () => {
    expect(parseWeekdays("abonament pentru 3 luni")).toBeUndefined();
    expect(parseWeekdays("de luni până duminică")).toBeUndefined();
    expect(parseWeekdays("Top Menu la 19,90 lei")).toBeUndefined();
  });
});

describe("findLeiPrice", () => {
  it("takes the amount next to lei, not the first number", () => {
    expect(findLeiPrice("Oferta din 19 octombrie, meniu complet la doar 19,90 lei")).toBeCloseTo(19.9);
    expect(findLeiPrice("Marți Bucket la 33.00 lei include 20 Hot Wings")).toBe(33);
    expect(findLeiPrice("20 Hot Wings")).toBeUndefined();
  });
});

describe("parseDateRange", () => {
  it.each([
    ["în perioada 19-25.10.2026", { start: "2026-10-19", end: "2026-10-25" }],
    ["valabil 01.07-31.12.2026", { start: "2026-07-01", end: "2026-12-31" }],
    ["în perioada 19 octombrie – 15 noiembrie 2026", { start: "2026-10-19", end: "2026-11-15" }],
    ["în perioada 12-16 octombrie 2026", { start: "2026-10-12", end: "2026-10-16" }],
    ["între 20 decembrie - 5 ianuarie 2027", { start: "2026-12-20", end: "2027-01-05" }],
  ])("reads %s", (text, expected) => {
    expect(parseDateRange(text)).toEqual(expected);
  });

  it("rejects text without a range", () => {
    expect(parseDateRange("în limita stocului disponibil")).toBeUndefined();
  });

  it("converts to Bucharest day bounds", () => {
    expect(dateRangeToIso({ start: "2026-10-19", end: "2026-10-25" })).toEqual({
      startsAt: "2026-10-18T21:00:00.000Z",
      endsAt: "2026-10-25T21:59:00.000Z",
    });
  });
});

describe("detectConditions", () => {
  it("spots delivery and app exclusions", () => {
    expect(detectConditions("Oferta NU este disponibilă la livrare. Doar în locațiile selectate.")).toEqual([
      "Nu se aplică la livrare",
      "Doar în restaurantele participante",
    ]);
    expect(detectConditions("în toate restaurantele, cu excepția serviciului delivery prin agregatori")).toEqual([
      "Nu se aplică la livrare",
    ]);
    expect(detectConditions("Disponibil doar în aplicația KFC")).toEqual(["Doar în aplicație"]);
  });
});

describe("truncate", () => {
  it("cuts on a word boundary", () => {
    expect(truncate("unu doi trei patru", 12)).toBe("unu doi…");
  });
});
