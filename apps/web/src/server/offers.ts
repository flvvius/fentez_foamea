import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";
import { loadOfferSnapshot } from "./snapshot";

export const fetchOfferSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeaders(
    new Headers({
      "cache-control": "public, max-age=60",
      "cdn-cache-control": "public, s-maxage=300, stale-while-revalidate=3600",
    }),
  );
  return loadOfferSnapshot();
});
