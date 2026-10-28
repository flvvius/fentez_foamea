import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";
import { pickHighlights, pickSaved, type Highlights, type SavedPicks } from "@/lib/highlights";
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

const MAX_SAVED_IDS = 200;

export const fetchSavedPicks = createServerFn({ method: "GET" })
  .validator((data: unknown): { ids: string[] } => {
    const ids = typeof data === "object" && data !== null ? (data as { ids?: unknown }).ids : undefined;
    if (!Array.isArray(ids)) return { ids: [] };
    return { ids: ids.filter((id): id is string => typeof id === "string" && id.length <= 64).slice(0, MAX_SAVED_IDS) };
  })
  .handler(async ({ data }): Promise<SavedPicks> => {
    if (data.ids.length === 0) return { picks: [], total: 0 };
    return pickSaved((await sharedSnapshot()).offers, data.ids, new Date());
  });
