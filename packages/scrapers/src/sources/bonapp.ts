import { BUCHAREST_CENTER, bucharestLocalToIso, collapseWhitespace, fromMinorUnits, parseTimeRange, type ScrapedOffer } from "@fentezfoamea/core";
import type { Source } from "../source.ts";

type MunchProduct = {
  id: string;
  name: string;
  stock_quantity: number;
  price_formatted: string | number;
  regular_price_formatted: string | number;
  currency: string;
  vendor: {
    id: string;
    name: string;
    address?: { street_1?: string; street_2?: string; city?: string; zip?: string };
  };
  latitude: string;
  longitude: string;
  pickup_intervals?: string;
  pickup_date?: string;
  slug: string;
  description?: string;
  type?: string;
  audience?: string;
  facets?: string[];
};

type MunchPage = { meta: { page: number; per_page: number; total_found: number }; data: MunchProduct[] };

const API = "https://api.service.munch.eco/v1/products";
const SHOP = "https://shop.munch.eco/ro";
const PER_PAGE = 100;
const NON_FOOD_FACETS = new Set(["virag", "noveny"]);
const MAX_PAGES = 20;

const HEADERS = {
  "Mch-App-Name": "b2c-web",
  "Mch-Platform": "web",
  "Mch-App-Env": "prod",
  "language-code": "ro",
};

export const bonapp: Source = {
  id: "bonapp",
  description: "Bonapp surplus bags (same platform as Munch)",
  async *scrape({ http, log }) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = new URL(API);
      url.search = new URLSearchParams({
        latitude: String(BUCHAREST_CENTER.lat),
        longitude: String(BUCHAREST_CENTER.lon),
        radius: "20",
        page: String(page),
        per_page: String(PER_PAGE),
        stock_status: "instock",
        orderby: "distance",
        order: "asc",
      }).toString();
      const body = await http.json<MunchPage>(url.toString(), { headers: HEADERS });
      log.info("bonapp page", { page, items: body.data.length, total: body.meta.total_found });
      for (const product of body.data) {
        const offer = toOffer(product);
        if (offer) yield offer;
      }
      if (body.data.length < PER_PAGE || page * PER_PAGE >= body.meta.total_found) break;
    }
  },
};

export function toOffer(product: MunchProduct): ScrapedOffer | undefined {
  if (product.currency !== "RON" || product.stock_quantity <= 0) return undefined;
  if (product.facets?.some((facet) => NON_FOOD_FACETS.has(facet))) return undefined;
  const [pickupStart, pickupEnd] = pickupWindow(product) ?? [];
  const address = formatAddress(product.vendor.address);
  return {
    sourceOfferId: product.id,
    kind: "surplus",
    title: collapseWhitespace(product.name),
    description: product.description ? collapseWhitespace(stripHtml(product.description)).slice(0, 300) || undefined : undefined,
    priceRon: fromMinorUnits(Number(product.price_formatted)),
    originalPriceRon: fromMinorUnits(Number(product.regular_price_formatted)),
    pickupStart,
    pickupEnd,
    availableCount: product.stock_quantity,
    url: `${SHOP}/product/${product.slug}`,
    deliveryOnly: false,
    venue: {
      sourceVenueId: product.vendor.id,
      name: collapseWhitespace(product.vendor.name),
      address,
      lat: Number(product.latitude) || undefined,
      lon: Number(product.longitude) || undefined,
    },
  };
}

function pickupWindow(product: MunchProduct): [string, string] | undefined {
  const range = product.pickup_intervals ? parseTimeRange(product.pickup_intervals) : undefined;
  if (!range || !product.pickup_date || range[0] === range[1]) return undefined;
  const start = bucharestLocalToIso(product.pickup_date, range[0]);
  const end = bucharestLocalToIso(product.pickup_date, range[1]);
  return start && end ? [start, end] : undefined;
}

function formatAddress(address: MunchProduct["vendor"]["address"]): string | undefined {
  if (!address) return undefined;
  const parts = [address.street_1, address.street_2, address.city]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.length ? unique.join(", ") : undefined;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
