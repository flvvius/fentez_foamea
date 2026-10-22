import { createFileRoute, notFound } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { ExplorePage, useExploreState } from "@/components/ExplorePage";
import { findLanding } from "@/lib/landing";
import { searchFromState, validateSearch, type ExploreState } from "@/lib/search";
import { SITE_URL } from "@/lib/site";
import { fetchOfferSnapshot } from "@/server/offers";
import { SNAPSHOT_HEADERS } from "./harta";

export const Route = createFileRoute("/$categorie")({
  validateSearch,
  beforeLoad: ({ params }) => {
    const landing = findLanding(params.categorie);
    if (!landing) throw notFound();
    return { landing };
  },
  loader: () => fetchOfferSnapshot(),
  headers: () => SNAPSHOT_HEADERS,
  head: ({ params }) => {
    const landing = findLanding(params.categorie);
    if (!landing) return {};
    const url = `${SITE_URL}/${landing.slug}`;
    const image = `${SITE_URL}/og?categorie=${landing.slug}`;
    return {
      meta: [
        { title: `${landing.title} · fentez foamea` },
        { name: "description", content: landing.description },
        { property: "og:title", content: landing.title },
        { property: "og:description", content: landing.description },
        { property: "og:url", content: url },
        { name: "twitter:title", content: landing.title },
        { name: "twitter:description", content: landing.description },
        { property: "og:image", content: image },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: Landing,
});

function Landing() {
  const { landing } = Route.useRouteContext();
  const wire = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const defaults = useMemo(() => ({ kinds: [landing.kind] }), [landing.kind]);
  const state = useExploreState(search, defaults);

  const onChange = useCallback(
    (next: Partial<ExploreState>) => {
      const merged = { ...state, ...next };
      const leavesLanding = merged.kinds.length !== 1 || merged.kinds[0] !== landing.kind;
      const target = searchFromState(merged);
      if (leavesLanding) return navigate({ to: "/harta", search: target, resetScroll: false });
      delete target.tip;
      return navigate({ search: target, replace: true, resetScroll: false });
    },
    [navigate, state, landing.kind],
  );

  return <ExplorePage wire={wire} state={state} headline={landing.headline} onChange={onChange} />;
}
