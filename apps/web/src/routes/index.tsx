import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { DealFeed } from "@/components/deals/DealFeed";
import { HomeHighlights } from "@/components/HomeHighlights";
import { SiteHeader } from "@/components/SiteHeader";
import { useSession } from "@/lib/auth-client";
import { SITE_URL } from "@/lib/site";
import { fetchDealFeed } from "@/server/deals/feed";
import { fetchHighlights } from "@/server/highlights";
import type { FeedSort } from "@/server/deals/feed-select";
import { UUID_RE } from "@/server/deals/uuid";

type IndexSearch = { sort?: FeedSort; posted?: string };

// Query parameters of the map, which lived at "/" before the feed did. Links already shared or
// indexed (venue pages, shared offers, searches) are sent on to /harta with their parameters.
const MAP_PARAMS = ["tip", "km", "buget", "ordine", "livrare", "local", "oferta", "q"] as const;

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): IndexSearch => ({
    sort: search.sort === "latest" || search.sort === "popular" ? search.sort : undefined,
    // The id of a deal the user just published (see /posteaza): pinned on top of the list.
    posted: typeof search.posted === "string" && UUID_RE.test(search.posted) ? search.posted.toLowerCase() : undefined,
  }),
  beforeLoad: ({ location }) => {
    const raw = location.search as Record<string, unknown>;
    const legacy = Object.fromEntries(MAP_PARAMS.filter((key) => raw[key] !== undefined).map((key) => [key, raw[key]]));
    if (Object.keys(legacy).length) throw redirect({ to: "/harta", search: legacy, statusCode: 301 });
  },
  loaderDeps: ({ search }) => ({ sort: search.sort ?? "popular" }),
  loader: async ({ deps }) => {
    const [page, highlights] = await Promise.all([fetchDealFeed({ data: { sort: deps.sort } }), fetchHighlights()]);
    return { page, highlights };
  },
  // Header precedence: during SSR the loader's server fn (fetchDealFeed) sets its own
  // cache-control, and that value replaces these route headers on the page response (curl on
  // "/" shows "public, max-age=30" and s-maxage=60, stale-while-revalidate=300). These values
  // describe the same 60 s freshness and only matter if the server fn sets nothing.
  headers: () => ({
    "cache-control": "public, max-age=0, must-revalidate",
    "cdn-cache-control": "public, s-maxage=60, stale-while-revalidate=300",
  }),
  head: () => ({
    meta: [
      { title: "Mâncare ieftină în București, azi · fentez foamea" },
      {
        name: "description",
        content: "Cele mai bune oferte de mâncare din București de azi: pachete anti-risipă, meniuri de prânz, reduceri și oferte postate de comunitate.",
      },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
  }),
  component: Home,
});

const SORTS: { key: FeedSort; label: string }[] = [
  { key: "popular", label: "Populare" },
  { key: "latest", label: "Noi" },
];

function Home() {
  const { page, highlights } = Route.useLoaderData();
  const { sort: sortParam, posted } = Route.useSearch();
  const sort = sortParam ?? "popular";
  const navigate = useNavigate();
  const session = useSession();
  const signedOut = !session.isPending && !session.data;

  return (
    <>
      <SiteHeader />
      <main className="page">
        <div className="page-head">
          <div>
            <h1 className="headline">Mâncare ieftină în București, azi</h1>
            <p className="lede">Pachete anti-risipă, meniuri de prânz și reduceri de la restaurante, plus ofertele găsite de oameni ca tine.</p>
          </div>
          {signedOut ? (
            <Link to="/autentificare" search={{ redirect: "/posteaza" }} className="btn-primary">
              Postează o ofertă
            </Link>
          ) : (
            <Link to="/posteaza" className="btn-primary">
              Postează o ofertă
            </Link>
          )}
        </div>

        <HomeHighlights highlights={highlights} />

        <h2 className="section-title feed-title">De la comunitate</h2>
        <div className="sort-tabs" role="group" aria-label="Sortare">
          {SORTS.map((option) => (
            <button
              key={option.key}
              type="button"
              className="sort-tab"
              aria-pressed={sort === option.key}
              onClick={() => void navigate({ to: "/", search: { sort: option.key } })}
            >
              {option.label}
            </button>
          ))}
        </div>

        <DealFeed key={`${sort}`} sort={sort} initial={page} postedId={posted} />
      </main>
    </>
  );
}
