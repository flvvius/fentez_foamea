import type { ExtractionDraft } from "@fentezfoamea/core";
import { describe, expect, it } from "vitest";
import {
  bucharestDayEndIso,
  bucharestDayStartIso,
  draftFromForm,
  emptyForm,
  formFromDraft,
  formNotADiscount,
  isoToBucharestDate,
  mergeExtraction,
  parseNumberInput,
  requiredFieldsFilled,
  serverDraftErrorMessage,
  serverFieldToFormField,
  validateForm,
  type FormState,
} from "./deal-form";

const filled = (patch: Partial<FormState> = {}): FormState => ({
  ...emptyForm(),
  restaurantName: "Trattoria",
  title: "Pizza 1+1",
  ...patch,
});

describe("parseNumberInput", () => {
  it("reads dots and commas, and treats blank as null", () => {
    expect(parseNumberInput("12.50")).toBe(12.5);
    expect(parseNumberInput(" 12,5 ")).toBe(12.5);
    expect(parseNumberInput("")).toBeNull();
    expect(parseNumberInput("  ")).toBeNull();
  });
  it("keeps unreadable input as NaN so validation can reject it", () => {
    expect(parseNumberInput("abc")).toBeNaN();
    expect(parseNumberInput("1.2.3")).toBeNaN();
  });
});

describe("Bucharest days", () => {
  it("converts the start and end of a winter day (UTC+2)", () => {
    expect(bucharestDayStartIso("2026-01-15")).toBe("2026-01-14T22:00:00.000Z");
    expect(bucharestDayEndIso("2026-01-15")).toBe("2026-01-15T21:59:59.000Z");
  });

  it("converts the start and end of a summer day (UTC+3)", () => {
    expect(bucharestDayStartIso("2026-07-15")).toBe("2026-07-14T21:00:00.000Z");
    expect(bucharestDayEndIso("2026-07-15")).toBe("2026-07-15T20:59:59.000Z");
  });

  it("uses the right offsets across the spring DST change (29 March 2026)", () => {
    expect(bucharestDayStartIso("2026-03-29")).toBe("2026-03-28T22:00:00.000Z");
    expect(bucharestDayEndIso("2026-03-29")).toBe("2026-03-29T20:59:59.000Z");
  });

  it("uses the right offsets across the autumn DST change (25 October 2026)", () => {
    expect(bucharestDayStartIso("2026-10-25")).toBe("2026-10-24T21:00:00.000Z");
    expect(bucharestDayEndIso("2026-10-25")).toBe("2026-10-25T21:59:59.000Z");
  });

  it("reads an instant back as its Bucharest date", () => {
    expect(isoToBucharestDate("2026-10-25T21:59:59.000Z")).toBe("2026-10-25");
    expect(isoToBucharestDate("2026-07-14T21:00:00.000Z")).toBe("2026-07-15");
    expect(isoToBucharestDate(null)).toBe("");
    expect(isoToBucharestDate("garbage")).toBe("");
  });
});

describe("draftFromForm", () => {
  it("turns every empty field into null", () => {
    expect(draftFromForm(filled())).toEqual({
      restaurantName: "Trattoria",
      title: "Pizza 1+1",
      description: null,
      dealType: "other",
      dealPrice: null,
      regularPrice: null,
      percentOff: null,
      currency: "RON",
      daysOfWeek: null,
      timeStart: null,
      timeEnd: null,
      validFrom: null,
      validUntil: null,
      channel: "in_store",
      promoCode: null,
      address: null,
      lat: null,
      lon: null,
    });
  });

  it("converts numbers, dates, days and times", () => {
    const draft = draftFromForm(
      filled({
        dealPrice: "25,5",
        regularPrice: "40",
        percentOff: "36",
        daysOfWeek: [5, 1, 1],
        timeStart: "12:00",
        timeEnd: "15:00",
        validFrom: "2026-07-15",
        validUntil: "2026-07-20",
        description: "  bun  ",
      }),
    );
    expect(draft).toMatchObject({
      dealPrice: 25.5,
      regularPrice: 40,
      percentOff: 36,
      daysOfWeek: [1, 5],
      timeStart: "12:00",
      timeEnd: "15:00",
      validFrom: "2026-07-14T21:00:00.000Z",
      validUntil: "2026-07-20T20:59:59.000Z",
      description: "bun",
    });
  });

  it("only keeps the promo code for the promo_code channel", () => {
    expect(draftFromForm(filled({ channel: "in_store", promoCode: "X" })).promoCode).toBeNull();
    expect(draftFromForm(filled({ channel: "promo_code", promoCode: " X " })).promoCode).toBe("X");
  });
});

describe("formFromDraft", () => {
  const extraction: ExtractionDraft = {
    restaurantName: null,
    title: "Burger + cartofi",
    description: null,
    dealType: "combo",
    dealPrice: 29.9,
    regularPrice: 45,
    percentOff: 34,
    currency: "RON",
    daysOfWeek: [3, 1],
    timeStart: "22:00",
    timeEnd: "02:00",
    validFrom: "2026-07-14T21:00:00.000Z",
    validUntil: "2026-10-25T21:59:59.000Z",
    channel: "promo_code",
    promoCode: "FOAME",
    address: null,
    lat: null,
    lon: null,
  };

  it("fills inputs, leaving nulls empty and converting dates to Bucharest days", () => {
    expect(formFromDraft(extraction)).toEqual({
      restaurantName: "",
      title: "Burger + cartofi",
      description: "",
      dealType: "combo",
      dealPrice: "29.9",
      regularPrice: "45",
      percentOff: "34",
      currency: "RON",
      channel: "promo_code",
      promoCode: "FOAME",
      daysOfWeek: [1, 3],
      timeStart: "22:00",
      timeEnd: "02:00",
      validFrom: "2026-07-15",
      validUntil: "2026-10-25",
      address: "",
    });
  });

  it("round-trips through draftFromForm", () => {
    const again = draftFromForm(formFromDraft(extraction));
    expect(again).toMatchObject({
      dealPrice: 29.9,
      validFrom: "2026-07-14T21:00:00.000Z",
      validUntil: "2026-10-25T21:59:59.000Z",
      timeStart: "22:00",
      timeEnd: "02:00",
    });
  });
});

describe("validateForm", () => {
  const now = new Date("2026-10-22T12:00:00Z");

  it("accepts a minimal form", () => {
    const result = validateForm(filled(), now);
    expect(result.ok).toBe(true);
  });

  it("requires restaurant and title", () => {
    const result = validateForm(emptyForm(), now);
    expect(result).toMatchObject({
      ok: false,
      errors: { restaurantName: "Completează numele restaurantului.", title: "Completează titlul ofertei." },
    });
    expect(requiredFieldsFilled(emptyForm())).toBe(false);
    expect(requiredFieldsFilled(filled())).toBe(true);
  });

  it("reports unreadable numbers, bad currency and a lone time", () => {
    const result = validateForm(filled({ dealPrice: "abc", currency: "LEI1", percentOff: "150" }), now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.dealPrice).toBe("Introdu un preț valid.");
    expect(result.errors.currency).toContain("3 litere");
    expect(result.errors.percentOff).toContain("între 1 și 100");
  });

  it("asks for both times when only one is given", () => {
    const result = validateForm(filled({ timeStart: "10:00" }), now);
    expect(result).toMatchObject({ ok: false, errors: { timeEnd: expect.stringContaining("ora de început, și ora de final") } });
  });

  it("allows an overnight window but not equal times", () => {
    expect(validateForm(filled({ timeStart: "22:00", timeEnd: "02:00" }), now).ok).toBe(true);
    const same = validateForm(filled({ timeStart: "10:00", timeEnd: "10:00" }), now);
    expect(same.ok).toBe(false);
  });

  it("rejects an end date before the start and one in the past", () => {
    const reversed = validateForm(filled({ validFrom: "2026-11-05", validUntil: "2026-11-01" }), now);
    expect(reversed).toMatchObject({ ok: false, errors: { validUntil: expect.stringContaining("înainte") } });
    const past = validateForm(filled({ validUntil: "2026-10-01" }), now);
    expect(past).toMatchObject({ ok: false, errors: { validUntil: "Data de final a trecut deja." } });
  });

  it("allows today as the last day", () => {
    expect(validateForm(filled({ validUntil: "2026-10-22" }), now).ok).toBe(true);
  });
});

describe("serverFieldToFormField", () => {
  it("maps draft fields, folds lat/lon into the address, ignores unknowns", () => {
    expect(serverFieldToFormField("title")).toBe("title");
    expect(serverFieldToFormField("lat")).toBe("address");
    expect(serverFieldToFormField("nope")).toBeNull();
    expect(serverFieldToFormField(null)).toBeNull();
  });
});

describe("serverDraftErrorMessage", () => {
  it("explains a rejected end date and falls back for other fields", () => {
    expect(serverDraftErrorMessage("validUntil")).toContain("a trecut");
    expect(serverDraftErrorMessage("title")).toContain("Verific-o");
  });
});

describe("formNotADiscount", () => {
  it("is true once the deal price reaches the regular price", () => {
    expect(formNotADiscount({ dealPrice: "40", regularPrice: "40" })).toBe(true);
    expect(formNotADiscount({ dealPrice: "45,5", regularPrice: "40" })).toBe(true);
    expect(formNotADiscount({ dealPrice: "30", regularPrice: "40" })).toBe(false);
    expect(formNotADiscount({ dealPrice: "", regularPrice: "40" })).toBe(false);
    expect(formNotADiscount({ dealPrice: "x", regularPrice: "40" })).toBe(false);
  });
});

describe("price text inputs", () => {
  const now = new Date("2026-10-22T12:00:00Z");

  it("accepts a comma decimal as typed on iOS", () => {
    const result = validateForm(filled({ dealPrice: "12,5", regularPrice: "20,00" }), now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toMatchObject({ dealPrice: 12.5, regularPrice: 20 });
  });

  it("reports unreadable text on the field instead of dropping it", () => {
    const result = validateForm(filled({ dealPrice: "12,5 lei", regularPrice: "douăzeci", percentOff: "zece" }), now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.dealPrice).toBe("Introdu un preț valid.");
    expect(result.errors.regularPrice).toBe("Introdu un preț normal valid.");
    expect(result.errors.percentOff).toContain("între 1 și 100");
  });

  it("rejects a decimal percentage and more than two price decimals", () => {
    const result = validateForm(filled({ percentOff: "12,5", dealPrice: "1,234" }), now);
    expect(result).toMatchObject({ ok: false, errors: { percentOff: expect.any(String), dealPrice: expect.stringContaining("2 zecimale") } });
  });
});

describe("mergeExtraction", () => {
  const extracted: FormState = {
    ...emptyForm(),
    restaurantName: "Din sursă",
    title: "Titlu din sursă",
    dealPrice: "25",
    dealType: "bogo",
    daysOfWeek: [1, 2],
  };

  it("keeps what the user typed and fills the rest", () => {
    const current = filled({ title: "Titlul meu", restaurantName: "" });
    const merged = mergeExtraction(current, extracted, new Set(["title", "restaurantName"]));
    expect(merged.title).toBe("Titlul meu");
    expect(merged.restaurantName).toBe("Din sursă");
    expect(merged.dealPrice).toBe("25");
  });

  it("keeps a chosen select and chosen days when the user touched them", () => {
    const current = filled({ dealType: "combo", daysOfWeek: [6] });
    const merged = mergeExtraction(current, extracted, new Set(["dealType", "daysOfWeek"]));
    expect(merged.dealType).toBe("combo");
    expect(merged.daysOfWeek).toEqual([6]);
  });

  it("replaces fields an earlier autofill set but the user never touched", () => {
    const current = filled({ title: "Vechi din autofill", dealPrice: "10" });
    const merged = mergeExtraction(current, extracted, new Set());
    expect(merged.title).toBe("Titlu din sursă");
    expect(merged.dealPrice).toBe("25");
  });

  it("takes the extracted value for a touched field the user has since emptied", () => {
    const current = filled({ title: "  " });
    expect(mergeExtraction(current, extracted, new Set(["title"])).title).toBe("Titlu din sursă");
  });
});
