import { OFFER_KIND_LABELS } from "@fentezfoamea/core";
import { formatPrice } from "./format";
import type { Offer } from "./offers";
import { SITE_NAME } from "./site";

export type ShareResult = "shared" | "copied" | "failed";

export function offerHeadline(offer: Pick<Offer, "title" | "price" | "discountPct" | "venueName" | "chain">): string {
  const price = offer.price === null ? null : `${formatPrice(offer.price)} lei`;
  const off = offer.discountPct ? `−${offer.discountPct}%` : null;
  const lead = [price, off].filter(Boolean).join(" ");
  const place = offer.venueName ?? offer.chain;
  return `${lead ? `${lead} · ` : ""}${offer.title}${place ? ` la ${place}` : ""}`;
}

export function offerSummary(offer: Pick<Offer, "kind" | "deliveryOnly">): string {
  const kind = OFFER_KIND_LABELS[offer.kind] + (offer.deliveryOnly ? ", doar livrare" : "");
  return `${kind}. Vezi oferta și alte reduceri din apropiere pe ${SITE_NAME}.`;
}

export function offerLink(origin: string, offerId: string): string {
  return `${origin}/?oferta=${encodeURIComponent(offerId)}`;
}

export function shareOffer(offer: Offer): Promise<ShareResult> {
  return shareLink(offerHeadline(offer), offerLink(window.location.origin, offer.id));
}

export function shareCurrentView(text: string): Promise<ShareResult> {
  const url = new URL(window.location.href);
  url.searchParams.delete("oferta");
  return shareLink(text, url.toString());
}

async function shareLink(text: string, url: string): Promise<ShareResult> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: text, text, url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "failed";
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return "copied";
  } catch {
    return "failed";
  }
}
