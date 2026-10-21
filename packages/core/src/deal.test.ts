import { describe, expect, it } from "vitest";
import { dealDraftSchema } from "./deal.ts";

const valid = {
  restaurantName: "Trattoria Roma",
  title: "1+1 la pizza Margherita",
  dealType: "bogo",
  channel: "in_store",
};

describe("dealDraftSchema", () => {
  it("accepts a minimal draft and fills defaults", () => {
    const draft = dealDraftSchema.parse(valid);
    expect(draft.currency).toBe("RON");
    expect(draft.description).toBeNull();
    expect(draft.daysOfWeek).toBeNull();
    expect(draft.lat).toBeNull();
  });

  it("accepts a full draft", () => {
    const result = dealDraftSchema.safeParse({
      ...valid,
      description: "Doar la masă",
      dealPrice: 25,
      regularPrice: 50,
      percentOff: 50,
      daysOfWeek: [1, 2, 3],
      timeStart: "12:00",
      timeEnd: "16:30",
      validFrom: "2026-10-22T00:00:00+03:00",
      validUntil: "2026-11-30T23:59:00Z",
      promoCode: "FOAME10",
      address: "Strada Lipscani 1",
      lat: 44.43,
      lon: 26.1,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed time", () => {
    expect(dealDraftSchema.safeParse({ ...valid, timeStart: "25:00" }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, timeEnd: "9:30" }).success).toBe(false);
  });

  it("requires lat and lon together", () => {
    expect(dealDraftSchema.safeParse({ ...valid, lat: 44.4 }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, lon: 26.1 }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, lat: 44.4, lon: 26.1 }).success).toBe(true);
  });

  it("rejects duplicate or out-of-range weekdays", () => {
    expect(dealDraftSchema.safeParse({ ...valid, daysOfWeek: [1, 1] }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, daysOfWeek: [0, 8] }).success).toBe(false);
  });

  it("rejects bad numbers and currency", () => {
    expect(dealDraftSchema.safeParse({ ...valid, dealPrice: -1 }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, regularPrice: 0 }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, percentOff: 101 }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, currency: "ron" }).success).toBe(false);
  });

  it("rejects an empty weekday array", () => {
    expect(dealDraftSchema.safeParse({ ...valid, daysOfWeek: [] }).success).toBe(false);
  });

  it("rejects validFrom after validUntil and accepts equal or ordered", () => {
    const from = "2026-11-10T00:00:00Z";
    expect(
      dealDraftSchema.safeParse({ ...valid, validFrom: from, validUntil: "2026-11-09T00:00:00Z" }).success,
    ).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, validFrom: from, validUntil: from }).success).toBe(true);
    expect(dealDraftSchema.safeParse({ ...valid, validFrom: from }).success).toBe(true);
  });

  it("rejects whitespace-only and trims the title and restaurant name", () => {
    expect(dealDraftSchema.safeParse({ ...valid, title: "   " }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, restaurantName: " \t\n" }).success).toBe(false);
    expect(dealDraftSchema.parse({ ...valid, title: "  Pizza  " }).title).toBe("Pizza");
  });

  it("enforces maximum lengths", () => {
    expect(dealDraftSchema.safeParse({ ...valid, restaurantName: "a".repeat(120) }).success).toBe(true);
    expect(dealDraftSchema.safeParse({ ...valid, restaurantName: "a".repeat(121) }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, title: "a".repeat(141) }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, description: "a".repeat(1001) }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, promoCode: "a".repeat(65) }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, address: "a".repeat(201) }).success).toBe(false);
  });

  it("rejects invalid enum values", () => {
    expect(dealDraftSchema.safeParse({ ...valid, dealType: "free_lunch" }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, channel: "pigeon" }).success).toBe(false);
  });

  it("rejects non-ISO datetimes", () => {
    expect(dealDraftSchema.safeParse({ ...valid, validUntil: "2026-11-30" }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, validUntil: "30/11/2026" }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, validFrom: "tomorrow" }).success).toBe(false);
  });

  it("limits price precision and size", () => {
    expect(dealDraftSchema.safeParse({ ...valid, dealPrice: 12.5 }).success).toBe(true);
    expect(dealDraftSchema.safeParse({ ...valid, dealPrice: 19.99 }).success).toBe(true);
    expect(dealDraftSchema.safeParse({ ...valid, dealPrice: 12.345 }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, regularPrice: 10.001 }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, dealPrice: 99_999_999.99 }).success).toBe(true);
    expect(dealDraftSchema.safeParse({ ...valid, dealPrice: 100_000_000 }).success).toBe(false);
  });

  it("requires both times or neither", () => {
    expect(dealDraftSchema.safeParse({ ...valid, timeStart: "12:00" }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, timeEnd: "14:00" }).success).toBe(false);
  });

  it("rejects equal times but allows a window across midnight", () => {
    expect(dealDraftSchema.safeParse({ ...valid, timeStart: "12:00", timeEnd: "12:00" }).success).toBe(false);
    expect(dealDraftSchema.safeParse({ ...valid, timeStart: "22:00", timeEnd: "02:00" }).success).toBe(true);
  });
});
