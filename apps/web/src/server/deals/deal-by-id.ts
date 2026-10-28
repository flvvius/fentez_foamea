import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders, setResponseStatus } from "@tanstack/react-start/server";
import { loadDealById } from "./deal-by-id-query";
import { InvalidInputError } from "./inputs";
import { failInternally } from "./internal-error";
import type { DealCard } from "./types";
import { UUID_RE } from "./uuid";

export const fetchDealById = createServerFn({ method: "GET" })
  .validator((data: unknown): { id: string } => {
    const id = typeof data === "object" && data !== null ? (data as { id?: unknown }).id : undefined;
    if (typeof id !== "string" || !UUID_RE.test(id)) {
      setResponseStatus(400);
      throw new InvalidInputError();
    }
    return { id: id.toLowerCase() };
  })
  .handler(async ({ data }): Promise<DealCard | null> => {
    try {
      const deal = await loadDealById(data.id);
      setResponseHeaders(
        new Headers({
          "cache-control": "public, max-age=30",
          "cdn-cache-control": "public, s-maxage=60, stale-while-revalidate=300",
        }),
      );
      return deal;
    } catch (error) {
      return failInternally(error);
    }
  });
