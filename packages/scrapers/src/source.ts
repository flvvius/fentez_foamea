import type { ScrapedOffer, SourceId } from "@fentezfoamea/core";
import type { LazyBrowser } from "./browser.ts";
import type { GeminiExtractor } from "./gemini.ts";
import type { Geocoder } from "./geocode.ts";
import type { PoliteHttp } from "./http.ts";
import type { Logger } from "./log.ts";

export type SourceContext = {
  http: PoliteHttp;
  log: Logger;
  geocoder: Geocoder;
  gemini: GeminiExtractor | null;
  browser: LazyBrowser;
  limit?: number;
};

export type Source = {
  id: SourceId;
  description: string;
  scrape: (ctx: SourceContext) => AsyncIterable<ScrapedOffer>;
};
