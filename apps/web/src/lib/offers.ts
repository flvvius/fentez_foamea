import type { OfferKind, SourceId } from "@fentezfoamea/core";

export type Offer = {
  id: string;
  source: SourceId;
  kind: OfferKind;
  title: string;
  price: number | null;
  originalPrice: number | null;
  discountPct: number | null;
  endsAt: string | null;
  pickupStart: string | null;
  pickupEnd: string | null;
  daysOfWeek: number[] | null;
  timeStart: string | null;
  timeEnd: string | null;
  conditions: string | null;
  available: number | null;
  checkedAt: string | null;
  firstSeenAt: string | null;
  url: string;
  deliveryOnly: boolean;
  venueId: string | null;
  venueName: string | null;
  chain: string | null;
  lat: number | null;
  lon: number | null;
};

export type OfferSnapshot = { offers: Offer[]; updatedAt: string | null; generatedAt: string };

type Columns<T> = { [K in keyof T]: T[K][] };

type WireVenue = { id: string; name: string; chain: string | null; lat: number | null; lon: number | null; url: string | null };

type WireOffer = Omit<Offer, "venueId" | "venueName" | "chain" | "lat" | "lon" | "url"> & {
  venue: number | null;
  url: string | null;
};

export type SnapshotWire = {
  generatedAt: string;
  updatedAt: string | null;
  venues: Columns<WireVenue>;
  offers: Columns<WireOffer>;
};

export type VenueSource = { venueUrl: string | null };

const VENUE_KEYS = ["id", "name", "chain", "lat", "lon", "url"] as const satisfies (keyof WireVenue)[];
const OFFER_KEYS = [
  "id",
  "source",
  "kind",
  "title",
  "price",
  "originalPrice",
  "discountPct",
  "endsAt",
  "pickupStart",
  "pickupEnd",
  "daysOfWeek",
  "timeStart",
  "timeEnd",
  "conditions",
  "available",
  "checkedAt",
  "firstSeenAt",
  "url",
  "deliveryOnly",
  "venue",
] as const satisfies (keyof WireOffer)[];

export function encodeSnapshot(
  snapshot: Omit<OfferSnapshot, "offers"> & { offers: (Offer & VenueSource)[] },
): SnapshotWire {
  const venueIndex = new Map<string, number>();
  const venues: WireVenue[] = [];
  const offers = snapshot.offers.map(({ venueId, venueName, chain, lat, lon, venueUrl, url, ...offer }): WireOffer => {
    if (!venueId) return { ...offer, url, venue: null };
    let index = venueIndex.get(venueId);
    if (index === undefined) {
      index = venues.push({ id: venueId, name: venueName ?? "", chain, lat: roundCoord(lat), lon: roundCoord(lon), url: venueUrl }) - 1;
      venueIndex.set(venueId, index);
    }
    return { ...offer, url: url === venues[index]!.url ? null : url, venue: index };
  });
  return {
    generatedAt: snapshot.generatedAt,
    updatedAt: snapshot.updatedAt,
    venues: toColumns(venues, VENUE_KEYS),
    offers: toColumns(offers, OFFER_KEYS),
  };
}

export function decodeSnapshot(wire: SnapshotWire): OfferSnapshot {
  const venues = fromColumns(wire.venues, VENUE_KEYS);
  const offers = fromColumns(wire.offers, OFFER_KEYS).map(({ venue: index, url, ...offer }): Offer => {
    const venue = index === null ? undefined : venues[index];
    return {
      ...offer,
      title: venue ? titleWithoutVenue(offer.title, venue.name) : offer.title,
      url: url ?? venue?.url ?? "",
      venueId: venue?.id ?? null,
      venueName: venue?.name ?? null,
      chain: venue?.chain ?? null,
      lat: venue?.lat ?? null,
      lon: venue?.lon ?? null,
    };
  });
  return { generatedAt: wire.generatedAt, updatedAt: wire.updatedAt, offers };
}

const AFTER_VENUE_SEPARATOR = /^\s*[•·|:\-–—]\s*/;

export function titleWithoutVenue(title: string, venueName: string): string {
  if (!HAS_SEPARATOR.test(title)) return title;
  const text = title.normalize("NFC");
  const venuePrefix = venuePrefixPattern(venueName);
  const match = venuePrefix && venuePrefix.exec(foldLetters(text));
  if (!match) return title;
  const rest = text.slice(match[0].length);
  const separator = AFTER_VENUE_SEPARATOR.exec(rest);
  if (!separator) return title;
  const product = rest.slice(separator[0].length);
  return product ? product.charAt(0).toLocaleUpperCase("ro") + product.slice(1) : title;
}

const HAS_SEPARATOR = /[•·|:\-–—]/;
const venuePrefixes = new Map<string, RegExp | null>();

function venuePrefixPattern(venueName: string): RegExp | null {
  let pattern = venuePrefixes.get(venueName);
  if (pattern === undefined) {
    const words = foldLetters(venueName.normalize("NFC")).match(/[a-z0-9]+/g);
    pattern = words ? new RegExp(`^${words.join("[^a-z0-9]+")}[!?.'’]*`) : null;
    venuePrefixes.set(venueName, pattern);
  }
  return pattern;
}

function foldLetters(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function toColumns<T, K extends keyof T>(rows: T[], keys: readonly K[]): Columns<Pick<T, K>> {
  const columns = {} as Columns<Pick<T, K>>;
  for (const key of keys) columns[key] = rows.map((row) => row[key]);
  return columns;
}

function fromColumns<T, K extends keyof T>(columns: Columns<Pick<T, K>>, keys: readonly K[]): Pick<T, K>[] {
  const length = columns[keys[0]!].length;
  return Array.from({ length }, (_, index) => {
    const row = {} as Pick<T, K>;
    for (const key of keys) row[key] = columns[key][index]!;
    return row;
  });
}

function roundCoord(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1e5) / 1e5;
}
