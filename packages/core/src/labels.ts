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
