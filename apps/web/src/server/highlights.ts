import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";
import { pickHighlights, type Highlights } from "@/lib/highlights";
import { sharedSnapshot } from "./shared-snapshot";

export const fetchHighlights = createServerFn({ method: "GET" }).handler(async (): Promise<Highlights> => {
  try {
    const highlights = pickHighlights((await sharedSnapshot()).offers, new Date());
    setResponseHeaders(
      new Headers({
        "cache-control": "public, max-age=60",
        "cdn-cache-control": "public, s-maxage=120, stale-while-revalidate=600",
      }),
    );
    return highlights;
  } catch (error) {
    console.error("highlights:", error);
    return { picks: [], total: 0, kinds: [] };
  }
});
