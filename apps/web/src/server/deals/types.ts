import type { DealFlag } from "@fentezfoamea/core";

export type { DealFlag };
export type DealStatus = "pending" | "published" | "hidden" | "expired";
export type DealType = "bogo" | "percent_off" | "combo" | "fixed_price" | "happy_hour" | "other";
export type DealChannel = "in_store" | "app_only" | "delivery" | "promo_code";

/** Public feed shape. No email, no user id. */
export type DealCard = {
  id: string;
  restaurantName: string;
  title: string;
  description: string | null;
  dealType: DealType;
  dealPrice: number | null;
  regularPrice: number | null;
  percentOff: number | null;
  currency: string;
  notADiscount: boolean;
  /** ISO weekdays, Monday = 1 ... Sunday = 7. */
  daysOfWeek: number[] | null;
  /** "HH:MM"; timeStart > timeEnd means the window crosses midnight. */
  timeStart: string | null;
  timeEnd: string | null;
  validFrom: string | null;
  validUntil: string;
  channel: DealChannel;
  flags: DealFlag[];
  promoCode: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  score: number;
  createdAt: string;
  submitterName: string | null;
};

export type FeedPage = { deals: DealCard[]; nextCursor: string | null };
