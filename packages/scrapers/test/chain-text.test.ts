import { describe, expect, it } from "vitest";
import { parseDailyWindow, parseValidity, parseWeekdays } from "../src/romanian.ts";

describe("parseWeekdays on chain deal text", () => {
  it.each([
    ["Luni 1+1 cadou", [1]],
    ["Marți: orice pizza mică 19.5 lei", [2]],
    ["Ofertă valabilă de luni pana joi.", [1, 2, 3, 4]],
    ["LUNI SI MARTI: 1+1 DIN PARTEA CASEI", [1, 2]],
    ["în zilele de marți până duminică", [2, 3, 4, 5, 6, 7]],
    ["Mon-Fri luni-vineri", [1, 2, 3, 4, 5]],
  ])("reads %s", (text, expected) => {
    expect(parseWeekdays(text)).toEqual(expected);
  });

  it("ignores 'luni' meaning months and words without days", () => {
    expect(parseWeekdays("abonament pe 3 luni")).toBeUndefined();
    expect(parseWeekdays("XXL Box")).toBeUndefined();
  });

  it("treats every day as no restriction", () => {
    expect(parseWeekdays("de luni până duminică")).toBeUndefined();
  });
});

describe("parseValidity", () => {
  it("reads a compact numeric range", () => {
    expect(parseValidity("valabilă în perioada 19-25.10.2026")).toEqual({
      startsAt: "2026-10-18T21:00:00.000Z",
      endsAt: "2026-10-25T21:59:00.000Z",
    });
  });

  it("reads month names", () => {
    expect(parseValidity("în perioada 1 ianuarie – 31 decembrie 2025, în zilele")).toEqual({
      startsAt: "2024-12-31T22:00:00.000Z",
      endsAt: "2025-12-31T21:59:00.000Z",
    });
  });

  it("reads an end date only", () => {
    expect(parseValidity("Oferta e valabilă până la 11.11.2026")).toEqual({ endsAt: "2026-11-11T21:59:00.000Z" });
  });

  it("returns nothing without dates", () => {
    expect(parseValidity("Ofertă valabilă pentru pizza medie")).toEqual({});
  });
});

describe("parseDailyWindow", () => {
  it("reads hour ranges", () => {
    expect(parseDailyWindow("între orele 11:00 și 17:00")).toEqual(["11:00", "17:00"]);
    expect(parseDailyWindow("L-V 7.30-11")).toBeUndefined();
  });
});
