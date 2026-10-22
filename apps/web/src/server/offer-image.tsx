import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { OFFER_KIND_LABELS, type OfferKind } from "@fentezfoamea/core";
import { formatPrice } from "@/lib/format";
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
