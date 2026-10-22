import { createFileRoute } from "@tanstack/react-router";
import { LANDINGS } from "@/lib/landing";
import { SITE_URL } from "@/lib/site";
import { ZONES } from "@/lib/zones";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () =>
        new Response(sitemap(), {
          headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=86400" },
        }),
    },
  },
});

function sitemap(): string {
  const paths = [
    "/",
    ...LANDINGS.map((landing) => `/${landing.slug}`),
    ...ZONES.flatMap((zone) => [
      `/zona/${zone.slug}`,
      ...LANDINGS.filter((landing) => landing.inZones).map((landing) => `/zona/${zone.slug}/${landing.slug}`),
    ]),
  ];
  const urls = paths.map((path) => `  <url><loc>${SITE_URL}${path}</loc><changefreq>hourly</changefreq></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
