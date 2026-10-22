import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { OFFER_KIND_LABELS, type OfferKind } from "@fentezfoamea/core";
import { formatPrice } from "@/lib/format";
import { ZONE_RADIUS_KM, type Zone } from "@/lib/zones";
import { getSql } from "./db";
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
};

const WIDTH = 1200;
const HEIGHT = 630;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fonts = [
  { name: "Inter", data: fromDataUrl(interMedium), weight: 500 as const },
  { name: "Inter", data: fromDataUrl(interBold), weight: 700 as const },
];

export async function findOfferForImage(id: string): Promise<OfferCardRow | undefined> {
  if (!UUID.test(id)) return undefined;
  const [row] = await getSql()<OfferCardRow[]>`
    select title, kind, price_ron, original_price_ron, discount_pct, delivery_only, venue_name, venue_chain
    from live_offers where id = ${id}
  `;
  return row;
}

export async function renderOfferImage(offer: OfferCardRow): Promise<Response> {
  const place = offer.venue_name ?? offer.venue_chain;
  const kind = OFFER_KIND_LABELS[offer.kind] + (offer.delivery_only ? " · doar livrare" : "");
  const wasHigher = offer.original_price_ron !== null && offer.price_ron !== null && offer.original_price_ron > offer.price_ron;

  const svg = await satori(
    <div style={{ width: WIDTH, height: HEIGHT, boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 80px 64px", background: "#fcfbf8", color: "#1d1a16", fontFamily: "Inter" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30 }}>
        <span style={{ fontWeight: 700 }}>fentez foamea</span>
        <span style={{ fontWeight: 500, color: "#6b645b" }}>{kind}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <span style={{ fontSize: 160, fontWeight: 700, letterSpacing: -6, lineHeight: 1 }}>
            {offer.price_ron === null ? OFFER_KIND_LABELS[offer.kind] : formatPrice(offer.price_ron)}
          </span>
          {offer.price_ron !== null && <span style={{ fontSize: 48, fontWeight: 500, color: "#6b645b", marginLeft: 16, marginBottom: 18 }}>lei</span>}
          {wasHigher && (
            <span style={{ fontSize: 44, fontWeight: 500, color: "#6b645b", textDecoration: "line-through", marginLeft: 32, marginBottom: 20 }}>
              {formatPrice(offer.original_price_ron!)} lei
            </span>
          )}
          {offer.discount_pct !== null && (
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

export type TodaySummary = { total: number; bags: number; highlights: OfferCardRow[] };

export async function findTodaySummary(zone?: Zone): Promise<TodaySummary> {
  const sql = getSql();
  const nearZone = zone
    ? sql`and st_dwithin(location, st_setsrid(st_makepoint(${zone.lon}, ${zone.lat}), 4326)::geography, ${ZONE_RADIUS_KM * 1000})`
    : sql``;
  const [[counts], highlights] = await Promise.all([
    sql<{ total: number; bags: number }[]>`
      select count(*)::int as total, (count(*) filter (where kind = 'surplus'))::int as bags from live_offers
      where true ${nearZone}
    `,
    sql<OfferCardRow[]>`
      with picks as (
        select distinct on (coalesce(venue_name, title))
          title, kind, price_ron, original_price_ron, discount_pct, delivery_only, venue_name, venue_chain
        from live_offers
        where price_ron is not null and discount_pct >= 40 and not delivery_only and lat is not null ${nearZone}
          and (pickup_start is null
            or pickup_start < (date_trunc('day', now() at time zone 'Europe/Bucharest') + interval '1 day') at time zone 'Europe/Bucharest')
        order by coalesce(venue_name, title), discount_pct desc, price_ron
      )
      select * from picks order by discount_pct desc, price_ron limit 3
    `,
  ]);
  return { total: counts?.total ?? 0, bags: counts?.bags ?? 0, highlights };
}

const dayFormat = new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", weekday: "long", day: "numeric", month: "long" });

export async function renderTodayImage(today: TodaySummary, now: Date, zone?: Zone): Promise<Response> {
  const svg = await satori(
    <div style={{ width: WIDTH, height: HEIGHT, boxSizing: "border-box", display: "flex", padding: "64px 80px", background: "#fcfbf8", color: "#1d1a16", fontFamily: "Inter" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 560 }}>
        <span style={{ fontSize: 30, fontWeight: 700 }}>fentez foamea</span>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 30, fontWeight: 500, color: "#6b645b" }}>Azi, {dayFormat.format(now)}</span>
          <span style={{ fontSize: zone ? 64 : 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, marginTop: 12 }}>
            {countLabel(today.total, "ofertă", "oferte")} {zone ? `lângă ${zone.name}` : "în București"}
          </span>
          <span style={{ fontSize: 30, fontWeight: 500, color: "#6b645b", marginTop: 20 }}>
            {countLabel(today.bags, "pachet anti-risipă", "pachete anti-risipă")}, meniuri de prânz și reduceri, pe o hartă.
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", marginLeft: 64, width: 416, borderTop: "2px solid #e7e3dc" }}>
        {today.highlights.map((offer) => (
          <div key={offer.title + offer.venue_name} style={{ display: "flex", flexDirection: "column", padding: "18px 0", borderBottom: "2px solid #e7e3dc" }}>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>{formatPrice(offer.price_ron!)}</span>
              <span style={{ fontSize: 20, fontWeight: 500, color: "#6b645b", marginLeft: 6, marginBottom: 7 }}>lei</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#c2410c", marginLeft: 16, marginBottom: 6 }}>−{offer.discount_pct}%</span>
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
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function fromDataUrl(url: string): ArrayBuffer {
  const bytes = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
