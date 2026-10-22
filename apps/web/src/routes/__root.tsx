import "@fontsource-variable/inter";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import appCss from "../styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:locale", content: "ro_RO" },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:url", content: SITE_URL },
      { property: "og:image", content: `${SITE_URL}/og` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "fentez foamea: mâncare ieftină în București, acum" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SITE_TITLE },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      { name: "twitter:image", content: `${SITE_URL}/og` },
      { name: "theme-color", content: "#fcfcfb", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#0f1015", media: "(prefers-color-scheme: dark)" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "alternate", type: "application/rss+xml", title: "Pachete anti-risipă noi", href: "/feed.xml" },
      { rel: "preconnect", href: "https://tile.openstreetmap.org" },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="ro" className="antialiased">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Analytics />
        <SpeedInsights />
        <Scripts />
      </body>
    </html>
  );
}
