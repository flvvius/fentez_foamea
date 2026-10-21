import { collapseWhitespace, isInBucharest, parseRonPrice, type LatLon, type ScrapedOffer } from "@fentezfoamea/core";
import type { PoliteHttp } from "../http.ts";
import { detectConditions, foldRomanian, parseWeekdays, truncate } from "../romanian.ts";
import type { Source } from "../source.ts";
import { fetchPageData, postAction, richText } from "../sveltekit.ts";

export type TacoBellOffer = {
  slug: string;
  title: string;
  type?: string | null;
  price?: string | null;
  content?: unknown;
};

export type TacoBellRestaurant = {
  slug: string;
  title: string;
  restaurant_address?: string | null;
  restaurant_map_url?: string | null;
};

const SITE = "https://taco-bell.ro";
const MAX_PAGES = 20;

export const tacobell: Source = {
  id: "tacobell",
  description: "Taco Bell Romania offers, one per Bucharest restaurant",
  async *scrape({ http, log }) {
    const offers = await loadAll<TacoBellOffer>(http, `${SITE}/oferte`, "offers");
    const restaurants = await loadAll<TacoBellRestaurant>(http, `${SITE}/restaurante`, "restaurants");
    const stores = restaurants.flatMap((restaurant) => toStore(restaurant) ?? []);
    log.info("taco bell", { offers: offers.length, restaurants: restaurants.length, bucharest: stores.length });
    for (const offer of offers) yield* offerToOffers(offer, stores);
  },
};

export type TacoBellStore = LatLon & { id: string; name: string; address?: string };

export function toStore(restaurant: TacoBellRestaurant): TacoBellStore | undefined {
  const point = restaurant.restaurant_map_url ? coordinatesFromMapsUrl(restaurant.restaurant_map_url) : undefined;
  if (!point || !isInBucharest(point)) return undefined;
  return {
    id: restaurant.slug,
    name: collapseWhitespace(restaurant.title),
    address: restaurant.restaurant_address ? collapseWhitespace(restaurant.restaurant_address) : undefined,
    ...point,
  };
}

export function coordinatesFromMapsUrl(url: string): LatLon | undefined {
  const pin = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(url);
  const view = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url);
  const match = pin ?? view;
  return match ? { lat: Number(match[1]), lon: Number(match[2]) } : undefined;
}

export function offerToOffers(offer: TacoBellOffer, stores: TacoBellStore[]): ScrapedOffer[] {
  const body = richText(offer.content);
  const text = `${offer.title}\n${body}`;
  const conditions = detectConditions(text);
  if (offer.type === "click_and_collect" && !conditions.includes("Doar la comandă online cu ridicare")) {
    conditions.push("Doar la comandă online cu ridicare");
  }
  const discount = /reducere|-\s?\d{1,2}\s?%/.test(foldRomanian(text));
  return stores.map((store) => ({
    sourceOfferId: `${offer.slug}@${store.id}`,
    kind: discount ? "discount" : "combo",
    title: collapseWhitespace(offer.title),
    description: body ? truncate(collapseWhitespace(body)) : undefined,
    priceRon: parseRonPrice(offer.price),
    daysOfWeek: parseWeekdays(text),
    conditions: conditions.length ? conditions.join("; ") : undefined,
    url: `${SITE}/oferte/${offer.slug}`,
    deliveryOnly: false,
    venue: {
      sourceVenueId: store.id,
      name: store.name,
      address: store.address,
      lat: store.lat,
      lon: store.lon,
      chain: "Taco Bell",
    },
  }));
}

async function loadAll<T>(http: PoliteHttp, pageUrl: string, key: string): Promise<T[]> {
  const first = await fetchPageData(http, pageUrl);
  const items = listAt<T>(first, key);
  let hasMore = first.hasMore === true;
  for (let page = 1; hasMore && page < MAX_PAGES; page++) {
    const next = await postAction(http, pageUrl, "loadMore", { offset: String(items.length) });
    const batch = listAt<T>(next, key);
    if (batch.length === 0) break;
    items.push(...batch);
    hasMore = next.hasMore === true;
  }
  return items;
}

function listAt<T>(data: Record<string, unknown>, key: string): T[] {
  const value = data[key];
  return Array.isArray(value) ? [...(value as T[])] : [];
}
