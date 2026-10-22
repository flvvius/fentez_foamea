import { createFileRoute, notFound } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { ExplorePage, useExploreState } from "@/components/ExplorePage";
import { findZoneLanding } from "@/lib/landing";
import { searchForPage, validateSearch, type ExploreState, type PageDefaults } from "@/lib/search";
import { SITE_URL } from "@/lib/site";
import { ZONE_RADIUS_KM, findZone } from "@/lib/zones";
import { fetchOfferSnapshot } from "@/server/offers";
import { SNAPSHOT_HEADERS } from "./index";

export const Route = createFileRoute("/zona/$zona_/$categorie")({
  validateSearch,
  beforeLoad: ({ params }) => {
    const zone = findZone(params.zona);
    const landing = findZoneLanding(params.categorie);
    if (!zone || !landing) throw notFound();
    return { zone, landing };
  },
  loader: () => fetchOfferSnapshot(),
  headers: () => SNAPSHOT_HEADERS,
  head: ({ params }) => {
    const zone = findZone(params.zona);
    const landing = findZoneLanding(params.categorie);
    if (!zone || !landing) return {};
    const title = `${landing.nearName} lângă ${zone.name}`;
    const description = `${landing.nearName} la restaurante de lângă ${zone.name}, București, pe o hartă, cu preț, program și distanță. Ce găsești azi la câțiva pași.`;
    const url = `${SITE_URL}/zona/${zone.slug}/${landing.slug}`;
    const image = `${SITE_URL}/og?zona=${zone.slug}&categorie=${landing.slug}`;
    return {
      meta: [
        { title: `${title} · fentez foamea` },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { property: "og:image", content: image },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: ZoneCategoryPage,
});

function ZoneCategoryPage() {
  const { zone, landing } = Route.useRouteContext();
  const wire = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const defaults = useMemo<PageDefaults>(() => ({ radiusKm: ZONE_RADIUS_KM, kinds: [landing.kind] }), [landing.kind]);
  const state = useExploreState(search, defaults);
  const center = useMemo(() => ({ lat: zone.lat, lon: zone.lon, name: zone.name, slug: zone.slug }), [zone]);

  const onChange = useCallback(
    (next: Partial<ExploreState>) => {
      const merged = { ...state, ...next };
      const leavesCategory = merged.kinds.length !== 1 || merged.kinds[0] !== landing.kind;
      if (leavesCategory) {
        return navigate({
          to: "/zona/$zona",
          params: { zona: zone.slug },
          search: searchForPage(merged, { radiusKm: ZONE_RADIUS_KM }),
          resetScroll: false,
        });
      }
      return navigate({ search: searchForPage(merged, defaults), replace: true, resetScroll: false });
    },
    [navigate, state, landing.kind, zone.slug, defaults],
  );

  return (
    <ExplorePage
      key={`${zone.slug}/${landing.slug}`}
      wire={wire}
      state={state}
      headline={`${landing.nearName} lângă ${zone.name}, acum.`}
      center={center}
      onChange={onChange}
    />
  );
}
