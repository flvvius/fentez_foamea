import { BUCHAREST_CENTER, collapseWhitespace, isGenuineDiscount, type LatLon, type ScrapedOffer, type ScrapedVenue } from "@fentezfoamea/core";
import type { PoliteHttp } from "../http.ts";
import type { Source, SourceContext } from "../source.ts";

const GLOVO_APP_VERSION = "v1.2839.0";
const GLOVO_API_VERSION = "14";

const API = "https://api.glovoapp.com";
const SITE = "https://glovoapp.com/ro/ro/bucharest/stores";
const FOOD_CATEGORY = 1;
const PAGE_SIZE = 50;
const MAX_WALL_PAGES = 45;
const MAX_ADDRESS_LOOKUPS = 500;
const MAX_ITEM_STORES = 150;
const ITEMS_PER_STORE = 5;

const WALL_POINTS: LatLon[] = [
  BUCHAREST_CENTER,
  { lat: 44.4925, lon: 26.1255 },
  { lat: 44.4405, lon: 26.1765 },
  { lat: 44.3775, lon: 26.1195 },
  { lat: 44.4345, lon: 26.0105 },
];

export type WallPromotion = { type: string; benefit: string; description?: string; isPrime: boolean };

export type WallEntry = {
  id: string;
  slug: string;
  title: string;
  promotions?: WallPromotion[] | null;
  availability?: { status?: string };
  metadata?: { storeAddressId?: number };
};

type WallPage = { data: { stores: { pagination?: { totalEntries?: number }; entries: WallEntry[] } } };

export type StoreDetails = {
  id: number;
  addressId: number;
  address?: string | null;
  promotions?: { type: string; minimumBasketSizeCents?: number | null; isPrime?: boolean }[];
};

type InfoScreen = { sections?: { type: string; data?: { title?: string; elements?: { data?: { text?: string } }[] } }[] };

export type ProductPromotion = { type: string; price?: number; isPrime?: boolean; promotionId?: number };

export type ProductRow = {
  id: number;
  name: string;
  price: number;
  outOfStock?: boolean;
  promotions?: ProductPromotion[];
};

export type Outlet = {
  storeId: string;
  addressId: number;
  slug: string;
  title: string;
  promotions: WallPromotion[];
};

export const glovo: Source = {
  id: "glovo",
  rotating: { idPattern: "%:item:%", keepHours: 36 },
  description: "Glovo store promotions and discounted items, delivery only",
  async *scrape(ctx) {
    const { http, log } = ctx;
    const points = ctx.limit ? [BUCHAREST_CENTER] : WALL_POINTS;
    const maxPages = ctx.limit ? Math.max(2, Math.ceil(ctx.limit / 15)) : MAX_WALL_PAGES;

    const outlets = new Map<string, Outlet>();
    for (const point of points) {
      for (const entry of await crawlWall(http, point, maxPages)) {
        const outlet = toOutlet(entry);
        if (outlet) outlets.set(outletKey(outlet), outlet);
      }
      log.info("glovo wall", { point, outlets: outlets.size });
    }

    const outletsPerStore = countBy([...outlets.values()], (outlet) => outlet.storeId);
    const day = new Date().toISOString().slice(0, 10);
    const unlocatedFirst = rotate([...outlets.keys()], day).sort(
      (a, b) => Number(ctx.locatedVenueIds.has(a)) - Number(ctx.locatedVenueIds.has(b)),
    );
    const addressBudget = new Set(unlocatedFirst.slice(0, MAX_ADDRESS_LOOKUPS));
    const itemStores = new Set(
      rotate(
        unique([...outlets.values()].filter((outlet) => hasPublicPromo(outlet, "PERCENTAGE_DISCOUNT")).map((outlet) => outlet.storeId)),
        day,
      ).slice(0, MAX_ITEM_STORES),
    );
    log.info("glovo plan", { outlets: outlets.size, addressLookups: addressBudget.size, itemStores: itemStores.size, itemStoreCap: MAX_ITEM_STORES });

    const itemsByStore = new Map<string, ProductRow[]>();
    for (const [key, outlet] of outlets) {
      const details = addressBudget.has(key) ? await lookupOutlet(ctx, outlet) : undefined;
      const venue = toVenue(outlet, details?.address, (outletsPerStore.get(outlet.storeId) ?? 0) > 1);
      yield* storeOffers(outlet, venue, details?.minimumBasket);

      if (!itemStores.has(outlet.storeId)) continue;
      if (!itemsByStore.has(outlet.storeId)) itemsByStore.set(outlet.storeId, await fetchPromoItems(ctx, outlet));
      yield* itemOffers(outlet, venue, itemsByStore.get(outlet.storeId) ?? []);
    }
  },
};

async function crawlWall(http: PoliteHttp, point: LatLon, maxPages: number): Promise<WallEntry[]> {
  const seen = new Map<string, WallEntry>();
  for (let page = 0; page < maxPages; page++) {
    const url = `${API}/v1/web/store_wall/category/${FOOD_CATEGORY}?moduleId=StoreFeeds&offset=${seen.size}&limit=${PAGE_SIZE}&handlingType=DELIVERY`;
    const body = await http.json<WallPage>(url, {
      method: "POST",
      headers: glovoHeaders(point),
      body: JSON.stringify({ filters: [], previousStoreIds: [...seen.keys()] }),
    });
    const fresh = body.data.stores.entries.filter((entry) => !seen.has(entry.id));
    for (const entry of fresh) seen.set(entry.id, entry);
    if (fresh.length === 0) break;
  }
  return [...seen.values()];
}

async function lookupOutlet(ctx: SourceContext, outlet: Outlet): Promise<{ address?: string; minimumBasket?: number } | undefined> {
  try {
    const details = await ctx.http.json<StoreDetails>(`${API}/v3/stores/${outlet.storeId}`, { headers: glovoHeaders() });
    const minimumBasket = minimumBasketFor(details);
    if (details.addressId === outlet.addressId && details.address) {
      return { address: formatGlovoAddress(details.address), minimumBasket };
    }
    const info = await ctx.http.json<InfoScreen>(
      `${API}/v3/stores/${outlet.storeId}/addresses/${outlet.addressId}/store_info_screen`,
      { headers: glovoHeaders() },
    );
    const address = addressFromInfoScreen(info);
    return { address: address ? formatGlovoAddress(address) : undefined, minimumBasket };
  } catch (error) {
    ctx.log.warn("glovo address lookup failed", { store: outlet.slug, error: String(error) });
    return undefined;
  }
}

async function fetchPromoItems(ctx: SourceContext, outlet: Outlet): Promise<ProductRow[]> {
  try {
    const content = await ctx.http.json<unknown>(
      `${API}/v4/stores/${outlet.storeId}/addresses/${outlet.addressId}/content/main?nodeType=DEEP_LINK&link=promotii-pr`,
      { headers: glovoHeaders() },
    );
    return productRows(content);
  } catch (error) {
    ctx.log.warn("glovo promo items failed", { store: outlet.slug, error: String(error) });
    return [];
  }
}

export function glovoHeaders(point?: LatLon): Record<string, string> {
  const session = crypto.randomUUID();
  const now = String(Date.now());
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "ro",
    "content-type": "application/json",
    "glovo-api-version": GLOVO_API_VERSION,
    "glovo-app-version": GLOVO_APP_VERSION,
    "glovo-client-info": `web-customer-web-react/${GLOVO_APP_VERSION} project:customer-web`,
    "glovo-app-platform": "web",
    "glovo-app-type": "customer",
    "glovo-app-context": "web",
    "glovo-app-development-state": "prod",
    "glovo-language-code": "ro",
    "glovo-location-city-code": "buc",
    "glovo-location-country-code": "ro",
    "glovo-delivery-location-accuracy": "0",
    "glovo-delivery-location-timestamp": now,
    "glovo-request-id": crypto.randomUUID(),
    "glovo-perseus-client-id": crypto.randomUUID(),
    "glovo-perseus-session-id": session,
    "glovo-dynamic-session-id": session,
    "glovo-perseus-session-timestamp": now,
    "glovo-perseus-consent": "essential",
    "glovo-request-ttl": "7500",
    ...(point
      ? { "glovo-delivery-location-latitude": String(point.lat), "glovo-delivery-location-longitude": String(point.lon) }
      : {}),
  };
}

export function toOutlet(entry: WallEntry): Outlet | undefined {
  const addressId = entry.metadata?.storeAddressId;
  const promotions = (entry.promotions ?? []).filter((promo) => !promo.isPrime && PROMO_TYPES.has(promo.type));
  if (!addressId || promotions.length === 0) return undefined;
  return { storeId: String(entry.id), addressId, slug: entry.slug, title: collapseWhitespace(entry.title), promotions };
}

const PROMO_TYPES = new Set(["PERCENTAGE_DISCOUNT", "BASKET_PERCENTAGE", "TWO_FOR_ONE"]);

export function toVenue(outlet: Outlet, address: string | undefined, isChain: boolean): ScrapedVenue {
  return {
    sourceVenueId: outletKey(outlet),
    name: outlet.title,
    address,
    url: storeUrl(outlet),
    chain: isChain ? outlet.title : undefined,
  };
}

export function storeOffers(outlet: Outlet, venue: ScrapedVenue, minimumBasket?: number): ScrapedOffer[] {
  return outlet.promotions.map((promo) => ({
    sourceOfferId: `${outletKey(outlet)}:${promo.type}`,
    kind: promo.type === "TWO_FOR_ONE" ? "combo" : "discount",
    title: storePromoTitle(promo),
    conditions: minimumBasket ? `Comandă minimă ${formatRon(minimumBasket)} lei` : undefined,
    url: storeUrl(outlet),
    deliveryOnly: true,
    venue,
  }));
}

export function storePromoTitle(promo: WallPromotion): string {
  const benefit = promo.benefit.replace(/\s+/g, "");
  if (promo.type === "TWO_FOR_ONE") return "1+1 la unele produse";
  if (promo.type === "BASKET_PERCENTAGE") return `${benefit} la tot meniul`;
  return `${benefit} la unele produse`;
}

export function itemOffers(outlet: Outlet, venue: ScrapedVenue, rows: ProductRow[]): ScrapedOffer[] {
  return cheapestDiscountedItems(rows, ITEMS_PER_STORE).map(({ row, price }) => ({
    sourceOfferId: `${outletKey(outlet)}:item:${row.id}`,
    kind: "discount",
    title: collapseWhitespace(row.name),
    priceRon: price,
    originalPriceRon: roundRon(row.price),
    url: storeUrl(outlet),
    deliveryOnly: true,
    venue,
  }));
}

export function cheapestDiscountedItems(rows: ProductRow[], count: number): { row: ProductRow; price: number }[] {
  const seen = new Set<number>();
  return rows
    .filter((row) => !row.outOfStock && !seen.has(row.id) && seen.add(row.id))
    .flatMap((row) => {
      const promo = row.promotions?.find((p) => p.type === "PERCENTAGE_DISCOUNT" && !p.isPrime && typeof p.price === "number");
      if (!promo?.price) return [];
      const price = roundRon(promo.price);
      const original = roundRon(row.price);
      return isGenuineDiscount(price, original, 5) ? [{ row, price }] : [];
    })
    .sort((a, b) => a.price - b.price)
    .slice(0, count);
}

export function productRows(content: unknown): ProductRow[] {
  const rows: ProductRow[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const record = node as { type?: unknown; data?: unknown };
    if (record.type === "PRODUCT_ROW" && isProductRow(record.data)) rows.push(record.data);
    Object.values(node).forEach(visit);
  };
  visit(content);
  return rows;
}

function isProductRow(data: unknown): data is ProductRow {
  const row = data as Partial<ProductRow> | undefined;
  return typeof row?.id === "number" && typeof row.name === "string" && typeof row.price === "number";
}

export function minimumBasketFor(details: StoreDetails): number | undefined {
  const cents = details.promotions
    ?.filter((promo) => !promo.isPrime && PROMO_TYPES.has(promo.type))
    .map((promo) => promo.minimumBasketSizeCents ?? 0)
    .reduce((max, value) => Math.max(max, value), 0);
  return cents ? cents / 100 : undefined;
}

export function addressFromInfoScreen(info: InfoScreen): string | undefined {
  const section = info.sections?.find((s) => s.type === "LIST" && s.data?.title?.toLowerCase().startsWith("adres"));
  return section?.data?.elements?.[0]?.data?.text ?? undefined;
}

export function formatGlovoAddress(raw: string): string | undefined {
  const parts = raw
    .split(/\n|,/)
    .map((part) => collapseWhitespace(part.replace(/\b\d{5,6}\b/g, "").replace(/\b(\p{L}+)\s+\1\b/gu, "$1")))
    .filter((part) => part && !/^(romania|românia)$/i.test(part));
  if (parts.length === 0) return undefined;
  const joined = parts.join(", ");
  return /bucure[sșş]ti|bucharest/i.test(joined) ? joined : `${joined}, București`;
}

export function rotate<T extends string>(keys: T[], day: string): T[] {
  return [...keys].sort((a, b) => fnv1a(`${day}:${a}`) - fnv1a(`${day}:${b}`) || a.localeCompare(b));
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function hasPublicPromo(outlet: Outlet, type: string): boolean {
  return outlet.promotions.some((promo) => promo.type === type);
}

function outletKey(outlet: Pick<Outlet, "storeId" | "addressId">): string {
  return `${outlet.storeId}-${outlet.addressId}`;
}

function storeUrl(outlet: Outlet): string {
  return `${SITE}/${outlet.slug}`;
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function roundRon(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatRon(value: number): string {
  return value.toFixed(2).replace(/\.00$/, "").replace(".", ",");
}
