import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { DEAL_TYPE_LABELS, distanceMeters, OFFER_KIND_LABELS, type OfferKind } from "@fentezfoamea/core";
import { isStillAvailable, matchesQuery, percentInTitle, priceCapInTitle } from "@/components/explore";
import { formatPrice, sameBucharestDay } from "@/lib/format";
import type { Landing } from "@/lib/landing";
import type { Offer } from "@/lib/offers";
import { ZONE_RADIUS_KM, type Zone } from "@/lib/zones";
import type { DealCard } from "./deals/types";
import { sharedSnapshot } from "./shared-snapshot";
import interBold from "./fonts/Inter-Bold.woff?inline";
import interMedium from "./fonts/Inter-Medium.woff?inline";

type OfferCardRow = {
  title: string;
  kind: OfferKind;
  price_ron: number | null;
  original_price_ron: number | null;
  discount_pct: number | null;
  delivery_only: boolean;
  venue_name: string | null;
  venue_chain: string | null;
  kind_label?: string;
};

const WIDTH = 1200;
const HEIGHT = 630;

const fonts = [
  { name: "Inter", data: fromDataUrl(interMedium), weight: 500 as const },
  { name: "Inter", data: fromDataUrl(interBold), weight: 700 as const },
];

export async function findOfferForImage(id: string, now = new Date()): Promise<OfferCardRow | undefined> {
  const offer = (await sharedSnapshot()).offers.find((candidate) => candidate.id === id);
  return offer && isStillAvailable(offer, now) ? toCardRow(offer) : undefined;
}

export function dealCardRow(deal: DealCard): OfferCardRow {
  return {
    title: deal.title,
    kind: "discount",
    kind_label: DEAL_TYPE_LABELS[deal.dealType],
    price_ron: deal.currency === "RON" ? deal.dealPrice : null,
    original_price_ron: deal.notADiscount || deal.currency !== "RON" ? null : deal.regularPrice,
    discount_pct: deal.notADiscount ? null : deal.percentOff,
    delivery_only: deal.channel === "delivery",
    venue_name: deal.restaurantName,
    venue_chain: null,
  };
}

function toCardRow(offer: Offer): OfferCardRow {
  return {
    title: offer.title,
    kind: offer.kind,
    price_ron: offer.price,
    original_price_ron: offer.originalPrice,
    discount_pct: offer.discountPct,
    delivery_only: offer.deliveryOnly,
    venue_name: offer.venueName,
    venue_chain: offer.chain,
  };
}

export async function renderOfferImage(offer: OfferCardRow): Promise<Response> {
  const place = offer.venue_name ?? offer.venue_chain;
  const kind = (offer.kind_label ?? OFFER_KIND_LABELS[offer.kind]) + (offer.delivery_only ? " · doar livrare" : "");
  const wasHigher = offer.original_price_ron !== null && offer.price_ron !== null && offer.original_price_ron > offer.price_ron;
  const figure = headlineFigure(offer);

  const svg = await satori(
    <div style={{ width: WIDTH, height: HEIGHT, boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 80px 64px", background: "#fcfbf8", color: "#1d1a16", fontFamily: "Inter" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30 }}>
        <span style={{ fontWeight: 700 }}>fentez foamea</span>
        <span style={{ fontWeight: 500, color: "#6b645b" }}>{kind}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <span style={{ fontSize: 160, fontWeight: 700, letterSpacing: -6, lineHeight: 1, color: figure.deal ? "#c2410c" : "#1d1a16" }}>
            {figure.text}
          </span>
          {figure.unit && <span style={{ fontSize: 48, fontWeight: 500, color: "#6b645b", marginLeft: 16, marginBottom: 18 }}>{figure.unit}</span>}
          {wasHigher && (
            <span style={{ fontSize: 44, fontWeight: 500, color: "#6b645b", textDecoration: "line-through", marginLeft: 32, marginBottom: 20 }}>
              {formatPrice(offer.original_price_ron!)} lei
            </span>
          )}
          {offer.price_ron !== null && offer.discount_pct !== null && (
            <span style={{ fontSize: 56, fontWeight: 700, color: "#c2410c", marginLeft: 32, marginBottom: 16 }}>−{offer.discount_pct}%</span>
          )}
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 52, fontWeight: 700, lineHeight: 1.15, letterSpacing: -1 }}>{clip(offer.title, 70)}</div>
        {place && <div style={{ display: "flex", marginTop: 12, fontSize: 36, fontWeight: 500, color: "#6b645b" }}>{clip(place, 60)}</div>}
      </div>
    </div>,
    { width: WIDTH, height: HEIGHT, fonts },
  );
  return pngResponse(svg);
}

function headlineFigure(offer: OfferCardRow): { text: string; unit?: string; deal?: boolean } {
  if (offer.price_ron !== null) return { text: formatPrice(offer.price_ron), unit: "lei" };
  const pct = offer.discount_pct ?? percentInTitle(offer.title);
  if (pct !== null) return { text: `−${pct}%`, deal: true };
  const cap = priceCapInTitle(offer.title);
  if (cap !== null) return { text: `sub ${cap}`, unit: "lei" };
  return { text: offer.kind_label ?? OFFER_KIND_LABELS[offer.kind] };
}

export type TodaySummary = { total: number; bags: number; highlights: OfferCardRow[] };

export type VenueRef = { id: string; name: string };
export type SummaryScope = { zone?: Zone; landing?: Landing; venue?: VenueRef; query?: string };

export async function findVenue(id: string): Promise<VenueRef | undefined> {
  const offer = (await sharedSnapshot()).offers.find((candidate) => candidate.venueId === id);
  return offer?.venueId && offer.venueName ? { id: offer.venueId, name: offer.venueName } : undefined;
}

export async function findTodaySummary({ zone, landing, venue, query }: SummaryScope = {}, now = new Date()): Promise<TodaySummary> {
  const inScope = (await sharedSnapshot()).offers.filter(
    (offer) =>
      isStillAvailable(offer, now) &&
      (!landing || offer.kind === landing.kind) &&
      (!venue || offer.venueId === venue.id) &&
      (!query || matchesQuery(offer, query)) &&
      (!zone || (offer.lat !== null && offer.lon !== null && distanceMeters(zone, { lat: offer.lat, lon: offer.lon }) <= ZONE_RADIUS_KM * 1000)),
  );
  const showcase = inScope.filter(
    (offer) =>
      offer.price !== null &&
      (landing || venue || query || (offer.discountPct ?? 0) >= 40) &&
      !offer.deliveryOnly &&
      offer.lat !== null &&
      (!offer.pickupStart || new Date(offer.pickupStart) <= now || sameBucharestDay(new Date(offer.pickupStart), now)),
  );
  const bestPerPlace = new Map<string, Offer>();
  const shownDeals = new Set<string>();
  for (const offer of showcase.sort(byShowcaseOrder)) {
    const place = offer.chain ?? offer.venueName ?? offer.title;
    const deal = `${offer.title}|${offer.price}`;
    if (bestPerPlace.has(place) || shownDeals.has(deal)) continue;
    bestPerPlace.set(place, offer);
    shownDeals.add(deal);
  }
  return {
    total: inScope.length,
    bags: inScope.filter((offer) => offer.kind === "surplus").length,
    highlights: [...bestPerPlace.values()].sort(byShowcaseOrder).slice(0, 3).map(toCardRow),
  };
}

function byShowcaseOrder(a: Offer, b: Offer): number {
  return (b.discountPct ?? -1) - (a.discountPct ?? -1) || (a.price ?? Infinity) - (b.price ?? Infinity);
}

const dayFormat = new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", weekday: "long", day: "numeric", month: "long" });

export async function renderTodayImage(today: TodaySummary, now: Date, { zone, landing, venue, query }: SummaryScope = {}): Promise<Response> {
  const narrowed = zone || landing || venue || query;
  const counted = landing ? countLabel(today.total, ...landing.countNoun) : countLabel(today.total, "ofertă", "oferte");
  const svg = await satori(
    <div style={{ width: WIDTH, height: HEIGHT, boxSizing: "border-box", display: "flex", padding: "64px 80px", background: "#fcfbf8", color: "#1d1a16", fontFamily: "Inter" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 560 }}>
        <span style={{ fontSize: 30, fontWeight: 700 }}>fentez foamea</span>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 30, fontWeight: 500, color: "#6b645b" }}>Azi, {dayFormat.format(now)}</span>
          <span style={{ fontSize: narrowed ? 64 : 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, marginTop: 12 }}>
            {counted} {venue ? `la ${clip(venue.name, 40)}` : zone ? `lângă ${zone.name}` : query ? `cu „${clip(query, 24)}”` : "în București"}
          </span>
          <span style={{ fontSize: 30, fontWeight: 500, color: "#6b645b", marginTop: 20 }}>
            {landing || venue || query
              ? "Pe o hartă, ordonate după cât de aproape sunt de tine."
              : `${countLabel(today.bags, "pachet anti-risipă", "pachete anti-risipă")}, meniuri de prânz și reduceri, pe o hartă.`}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", marginLeft: 64, width: 416, borderTop: "2px solid #e7e3dc" }}>
        {today.highlights.map((offer) => (
          <div key={offer.title + offer.venue_name} style={{ display: "flex", flexDirection: "column", padding: "18px 0", borderBottom: "2px solid #e7e3dc" }}>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>{formatPrice(offer.price_ron!)}</span>
              <span style={{ fontSize: 20, fontWeight: 500, color: "#6b645b", marginLeft: 6, marginBottom: 7 }}>lei</span>
              {offer.discount_pct !== null && (
                <span style={{ fontSize: 22, fontWeight: 700, color: "#c2410c", marginLeft: 16, marginBottom: 6 }}>−{offer.discount_pct}%</span>
              )}
            </div>
            <span style={{ fontSize: 22, fontWeight: 500, marginTop: 4 }}>{clip(offer.title, 34)}</span>
            <span style={{ fontSize: 20, fontWeight: 500, color: "#6b645b" }}>{clip(offer.venue_name ?? offer.venue_chain ?? "", 36)}</span>
          </div>
        ))}
      </div>
    </div>,
    { width: WIDTH, height: HEIGHT, fonts },
  );
  return pngResponse(svg);
}

function countLabel(count: number, one: string, many: string): string {
  if (count === 1) return `1 ${one}`;
  const formatted = new Intl.NumberFormat("ro-RO").format(count);
  const lastTwo = count % 100;
  return lastTwo === 0 || lastTwo >= 20 ? `${formatted} de ${many}` : `${formatted} ${many}`;
}

function pngResponse(svg: string): Response {
  const png = new Resvg(svg).render().asPng();
  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600",
      "cdn-cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

function clip(text: string, max: number): string {
  const drawable = withFontGlyphs(text);
  return drawable.length > max ? `${drawable.slice(0, max - 1).trimEnd()}…` : drawable;
}

function withFontGlyphs(text: string): string {
  return text.replace(/•/g, "·").replace(/™/g, "");
}

function fromDataUrl(url: string): ArrayBuffer {
  const bytes = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
