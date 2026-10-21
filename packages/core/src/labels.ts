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
  bolt: "Bolt Food",
  glovo: "Glovo",
  chains: "Site-ul lanțului",
  daily: "Meniul zilei",
};
