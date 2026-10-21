import type { ScrapedOffer, SourceId } from "@fentezfoamea/core";
import type { GeminiExtractor } from "./gemini.ts";
import type { Geocoder } from "./geocode.ts";
import type { PoliteHttp } from "./http.ts";
import type { Logger } from "./log.ts";

export type SourceContext = {
  http: PoliteHttp;
  log: Logger;
  geocoder: Geocoder;
  gemini: GeminiExtractor | null;
  locatedVenueIds: ReadonlySet<string>;
  limit?: number;
};

export type RotatingOffers = {
  idPattern: string;
  keepHours: number;
};

export type Source = {
  id: SourceId;
  description: string;
  rotating?: RotatingOffers;
  scrape: (ctx: SourceContext) => AsyncIterable<ScrapedOffer>;
};
