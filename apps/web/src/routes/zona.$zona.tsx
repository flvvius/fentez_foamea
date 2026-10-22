import { createFileRoute, notFound } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { ExplorePage, searchForPage, useExploreState, type PageDefaults } from "@/components/ExplorePage";
import { validateSearch, type ExploreState } from "@/lib/search";
import { SITE_URL } from "@/lib/site";
import { ZONE_RADIUS_KM, findZone } from "@/lib/zones";
import { fetchOfferSnapshot } from "@/server/offers";
import { SNAPSHOT_HEADERS } from "./index";

const DEFAULTS: PageDefaults = { radiusKm: ZONE_RADIUS_KM };

export const Route = createFileRoute("/zona/$zona")({
  validateSearch,
  beforeLoad: ({ params }) => {
    const zone = findZone(params.zona);
    if (!zone) throw notFound();
    return { zone };
  },
  loader: () => fetchOfferSnapshot(),
  headers: () => SNAPSHOT_HEADERS,
  head: ({ params }) => {
    const zone = findZone(params.zona);
    if (!zone) return {};
    const title = `Mâncare ieftină lângă ${zone.name}`;
    const description = `Pachete anti-risipă, meniul zilei și reduceri la restaurante de lângă ${zone.name}, București. Ce poți mânca ieftin azi la câțiva pași.`;
    const url = `${SITE_URL}/zona/${zone.slug}`;
    const image = `${SITE_URL}/og?zona=${zone.slug}`;
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
  component: ZonePage,
});

function ZonePage() {
  const { zone } = Route.useRouteContext();
  const wire = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const state = useExploreState(search, DEFAULTS);
  const center = useMemo(() => ({ lat: zone.lat, lon: zone.lon, name: zone.name }), [zone]);

  const onChange = useCallback(
    (next: Partial<ExploreState>) =>
      navigate({ search: searchForPage({ ...state, ...next }, DEFAULTS), replace: true, resetScroll: false }),
    [navigate, state],
  );

  return (
    <ExplorePage
      key={zone.slug}
      wire={wire}
      state={state}
      headline={`Mâncare ieftină lângă ${zone.name}, acum.`}
      center={center}
      onChange={onChange}
    />
  );
}
