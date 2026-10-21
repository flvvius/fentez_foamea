import "@fontsource-variable/inter";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import appCss from "../styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "fentez foamea · mâncare ieftină în București" },
      {
        name: "description",
        content:
          "Pachete anti-risipă, meniuri de prânz și reduceri de la restaurante și fast-food-uri din București, pe o singură hartă.",
      },
      { name: "theme-color", content: "#fcfcfb", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#0f1015", media: "(prefers-color-scheme: dark)" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
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
        <Scripts />
      </body>
    </html>
  );
}
