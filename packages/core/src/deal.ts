import { z } from "zod";

export const DEAL_TYPES = [
  "bogo",
  "percent_off",
  "combo",
  "fixed_price",
  "happy_hour",
  "other",
] as const;
export type DealType = (typeof DEAL_TYPES)[number];

export const DEAL_CHANNELS = ["in_store", "app_only", "delivery", "promo_code"] as const;
export type DealChannel = (typeof DEAL_CHANNELS)[number];

export const DEAL_STATUSES = ["pending", "published", "hidden", "expired"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const SOURCE_TYPES = ["scraped", "user"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

const isoDateTime = z.iso.datetime({ offset: true });
const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

// numeric(10,2) in the database
const MAX_PRICE = 99_999_999.99;
const hasAtMostTwoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
const price = z
  .number()
  .max(MAX_PRICE)
  .refine(hasAtMostTwoDecimals, "At most 2 decimals");

/**
 * The fields a person can edit in the post form. Server-side fields (source, status, score) are not part of it.
 *
 * - `validUntil` stays nullable here. The submit endpoint defaults it to now + 7 days, because the
 *   database column is NOT NULL.
 * - `timeStart` and `timeEnd` come together or not at all. `timeStart` later than `timeEnd` is
 *   allowed and means the window crosses midnight (22:00 to 02:00). Equal times are rejected.
 */
export const dealDraftSchema = z
  .object({
    restaurantName: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(140),
    description: z.string().trim().max(1000).nullable().default(null),
    dealType: z.enum(DEAL_TYPES),
    dealPrice: price.nonnegative().nullable().default(null),
    regularPrice: price.positive().nullable().default(null),
    percentOff: z.number().int().min(1).max(100).nullable().default(null),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("RON"),
    daysOfWeek: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length, "Duplicate weekdays")
      .nullable()
      .default(null),
    timeStart: localTime.nullable().default(null),
    timeEnd: localTime.nullable().default(null),
    validFrom: isoDateTime.nullable().default(null),
    validUntil: isoDateTime.nullable().default(null),
    channel: z.enum(DEAL_CHANNELS),
    promoCode: z.string().trim().max(64).nullable().default(null),
    address: z.string().trim().max(200).nullable().default(null),
    lat: z.number().min(-90).max(90).nullable().default(null),
    lon: z.number().min(-180).max(180).nullable().default(null),
  })
  .superRefine((draft, ctx) => {
    if ((draft.lat === null) !== (draft.lon === null)) {
      ctx.addIssue({ code: "custom", message: "lat and lon must be given together", path: ["lat"] });
    }
    if ((draft.timeStart === null) !== (draft.timeEnd === null)) {
      ctx.addIssue({
        code: "custom",
        message: "timeStart and timeEnd must be given together",
        path: ["timeEnd"],
      });
    } else if (draft.timeStart !== null && draft.timeStart === draft.timeEnd) {
      ctx.addIssue({
        code: "custom",
        message: "timeStart and timeEnd must differ",
        path: ["timeEnd"],
      });
    }
    if (
      draft.validFrom !== null &&
      draft.validUntil !== null &&
      Date.parse(draft.validFrom) > Date.parse(draft.validUntil)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "validFrom must not be after validUntil",
        path: ["validUntil"],
      });
    }
  });

export type DealDraft = z.output<typeof dealDraftSchema>;
export type DealDraftInput = z.input<typeof dealDraftSchema>;
