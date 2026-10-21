import { collapseWhitespace, isInBucharest, type OfferKind, type ScrapedOffer, type ScrapedVenue } from "@fentezfoamea/core";
import { joinConditions, offersPerStore, withBucharest, type ChainDeal } from "../chain.ts";
import type { Source } from "../source.ts";
import { parseDailyWindow, parseValidity, parseWeekdays, truncate } from "../romanian.ts";

export type PizzaHutProduct = {
  itemId: string;
  name: string;
  description: string | null;
  price: number | null;
  fullPrice: number | null;
  standardPrice: number | null;
  isBogo: boolean | null;
  slug: string;
  outOfStock: boolean | null;
  availableOnlyOnDelivery: boolean | null;
  availableOnlyOnPickup: boolean | null;
  stamps: { name: string }[] | null;
  removeFromList: boolean | null;
};

export type PizzaHutLocation = {
  id: string;
  name: string;
  address: string | null;
  coordinates: string | null;
  cityId: number;
};

type DealsResponse = { data: { url?: string; categories: { products: PizzaHutProduct[] }[] } };
type LocationsResponse = { data: PizzaHutLocation[] };

const BASE = "https://www.pizzahut.ro";
const DEALS_URL = `${BASE}/ro/meniu-restaurant/oferte`;
const BUCHAREST_CITY_ID = 1;
const IGNORED_STAMPS = new Set(["nou"]);

export const pizzahut: Source = {
  id: "pizzahut",
  description: "Pizza Hut offers category, repeated for each Bucharest restaurant",
  async *scrape({ http, log }) {
    const deals = await http.json<DealsResponse>(`${BASE}/getProductsAndCategoryByCategoryId?categoryId=2`);
    const locations = await http.json<LocationsResponse>(`${BASE}/getLocations`);
    const offers = pizzaHutOffers(deals.data.categories[0]?.products ?? [], locations.data, deals.data.url);
    log.info("pizza hut", { offers: offers.length });
    yield* offers;
  },
};

export function pizzaHutOffers(products: PizzaHutProduct[], locations: PizzaHutLocation[], url = DEALS_URL): ScrapedOffer[] {
  const stores = locations.map(toPizzaHutStore).filter((store): store is ScrapedVenue => store !== undefined);
  return products
    .map((product) => toPizzaHutDeal(product, url))
    .filter((deal): deal is ChainDeal => deal !== undefined)
    .flatMap((deal) => offersPerStore(deal, stores));
}

export function toPizzaHutStore(location: PizzaHutLocation): ScrapedVenue | undefined {
  if (location.cityId !== BUCHAREST_CITY_ID) return undefined;
  const [lat, lon] = (location.coordinates ?? "").split(",").map((part) => Number(part.trim()));
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lon) && isInBucharest({ lat: lat!, lon: lon! });
  return {
    sourceVenueId: location.id,
    name: collapseWhitespace(location.name),
    address: location.address ? withBucharest(collapseWhitespace(location.address)) : undefined,
    lat: hasPoint ? lat : undefined,
    lon: hasPoint ? lon : undefined,
    chain: "Pizza Hut",
  };
}

export function toPizzaHutDeal(product: PizzaHutProduct, url = DEALS_URL): ChainDeal | undefined {
  if (product.outOfStock || product.removeFromList) return undefined;
  const name = collapseWhitespace(product.name);
  const description = collapseWhitespace(product.description ?? "");
  const kind = dealKind(product, name, description);
  if (!kind) return undefined;

  const price = product.price && product.price > 0 ? product.price : undefined;
  const standard = product.standardPrice && price && product.standardPrice > price ? product.standardPrice : undefined;
  const window = parseDailyWindow(description);
  const stamps = (product.stamps ?? []).map((stamp) => stamp.name).filter((stamp) => !IGNORED_STAMPS.has(stamp.toLowerCase()));

  return {
    dealId: product.itemId,
    kind,
    title: name,
    description: description ? truncate(description) : undefined,
    priceRon: price,
    originalPriceRon: standard,
    ...parseValidity(description),
    daysOfWeek: parseWeekdays(name) ?? parseWeekdays(description.replace(/\blmiercuri\b/gi, "miercuri")),
    timeStart: window?.[0],
    timeEnd: window?.[1],
    conditions: joinConditions([
      ...stamps,
      product.availableOnlyOnPickup && !stamps.some((stamp) => /ridicare/i.test(stamp)) ? "Doar la ridicare" : undefined,
      product.availableOnlyOnDelivery && !stamps.some((stamp) => /livrare/i.test(stamp)) ? "Doar cu livrare" : undefined,
    ]),
    url,
    deliveryOnly: Boolean(product.availableOnlyOnDelivery),
  };
}

function dealKind(product: PizzaHutProduct, name: string, description: string): OfferKind | undefined {
  if (product.standardPrice && product.price && product.standardPrice > product.price) return "discount";
  if (/\borice\b/i.test(name)) return "discount";
  if (product.isBogo || /\d\s*\+\s*\d|cadou|gratuit/i.test(name)) return "combo";
  if (/box|mix|meniu|menu|student/i.test(name) || /^meniuri?\b/i.test(description)) return "combo";
  return undefined;
}
