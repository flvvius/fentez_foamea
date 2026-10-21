import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders, setResponseStatus } from "@tanstack/react-start/server";
import { getSql } from "../db";
import { getDealsConfig } from "./config";
import { queryFeed } from "./feed-query";
import { InvalidCursorError } from "./feed-select";
import { failInternally } from "./internal-error";
import { InvalidInputError, parseFeedInput } from "./inputs";
import type { FeedPage } from "./types";

/**
 * Public, cacheable feed. Nothing here depends on who is asking: per-user state (my votes)
 * comes from fetchMyVotes so this response can sit in the CDN.
 * Failures throw an Error whose message is "invalid_input" or "invalid_cursor" (400), or
 * "internal_error" (500).
 */
export const fetchDealFeed = createServerFn({ method: "GET" })
  .validator((data: unknown) => {
    try {
      return parseFeedInput(data);
    } catch (error) {
      if (error instanceof InvalidInputError) setResponseStatus(400);
      throw error;
    }
  })
  .handler(async ({ data }): Promise<FeedPage> => {
    try {
      const page = await queryFeed(getSql(), {
        sort: data.sort,
        limit: data.limit,
        cursor: data.cursor,
        hideThreshold: getDealsConfig().hideScore,
      });
      setResponseHeaders(
        new Headers({
          "cache-control": "public, max-age=30",
          "cdn-cache-control": "public, s-maxage=60, stale-while-revalidate=300",
        }),
      );
      return page;
    } catch (error) {
      if (error instanceof InvalidCursorError) {
        setResponseStatus(400);
        throw error;
      }
      return failInternally(error);
    }
  });
