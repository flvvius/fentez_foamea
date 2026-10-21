import type { DealChannel, DealType } from "./deal.ts";
import type { OfferKind, SourceId } from "./offer.ts";

export const OFFER_KIND_LABELS: Record<OfferKind, string> = {
  surplus: "Pachet anti-risipă",
  discount: "Reducere",
  combo: "Combo / 1+1",
  daily_menu: "Meniul zilei",
  happy_hour: "Happy hour",
  coupon: "Cupon",
};

export const SOURCE_LABELS: Record<SourceId, string> = {
  bonapp: "Bonapp",
  wolt: "Wolt",
  glovo: "Glovo",
  kfc: "KFC",
  pizzahut: "Pizza Hut",
  tacobell: "Taco Bell",
  dominos: "Domino's",
  paul: "Paul",
  citygrill: "City Grill",
};

export const WEEKDAY_SHORT = ["L", "Ma", "Mi", "J", "V", "S", "D"] as const;

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  bogo: "1+1",
  percent_off: "Reducere procentuală",
  combo: "Meniu / combo",
  fixed_price: "Preț fix",
  happy_hour: "Happy hour",
  other: "Altceva",
};

export const DEAL_CHANNEL_LABELS: Record<DealChannel, string> = {
  in_store: "În local",
  app_only: "Doar în aplicație",
  delivery: "Livrare",
  promo_code: "Cod promoțional",
};
