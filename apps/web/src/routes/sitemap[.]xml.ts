import { createFileRoute } from "@tanstack/react-router";
import { LANDINGS } from "@/lib/landing";
import { SITE_URL } from "@/lib/site";
import { ZONES } from "@/lib/zones";
import { sharedSnapshot } from "@/server/shared-snapshot";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () =>
        new Response(sitemap(await venuesWithOffers()), {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
            "cdn-cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        }),
    },
  },
});

async function venuesWithOffers(): Promise<string[]> {
  const { offers } = await sharedSnapshot();
  return [...new Set(offers.flatMap((offer) => (offer.venueId && offer.lat !== null ? [offer.venueId] : [])))];
}

function sitemap(venueIds: string[]): string {
  const paths = [
    "/",
    "/harta",
    ...LANDINGS.map((landing) => `/${landing.slug}`),
    ...ZONES.flatMap((zone) => [
      `/zona/${zone.slug}`,
      ...LANDINGS.filter((landing) => landing.inZones).map((landing) => `/zona/${zone.slug}/${landing.slug}`),
    ]),
  ];
  paths.push(...venueIds.map((id) => `/harta?local=${id}`));
  const urls = paths.map((path) => `  <url><loc>${SITE_URL}${path}</loc><changefreq>hourly</changefreq></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
