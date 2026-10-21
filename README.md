# fentez foamea

fentez foamea puts cheap food in Bucharest on one map: surplus bags restaurants would otherwise throw away, lunch menus, weekday chain deals and delivery-app discounts. Scrapers collect offers from public sources into Postgres. A small website shows what is open near you right now and links each offer back to where you can buy it.

The UI is in Romanian. The code and docs are in English. For how the parts fit together, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Sources

| Source | What it contributes | State |
|---|---|---|
| Bonapp | Surplus bags with pickup windows and stock, about 480 offers from 215 venues on a weekday | Live |
| Wolt | Merchant campaigns (percent off, whole menu, free items) and up to 5 discounted items per venue | In progress |
| Glovo | Store promos (-X% on some items, whole menu, 1+1) and up to 5 discounted items per store | In progress |
| KFC, Taco Bell | National deals placed on every Bucharest restaurant, weekday deals | In progress |
| Pizza Hut, Domino's, Paul | Weekly offers, weekday 1+1 deals, bakery offers | In progress |
| City Grill group | Lunch menu at a fixed price on weekdays, student and 1+1 deals | In progress |

Delivery-app offers are marked "doar livrare" on the site because app prices can be higher than in the restaurant.

## Local development

You need Bun 1.3+, Node 22+ and Docker.

```sh
bun install
cp .env.example .env
docker compose up -d
```

`docker compose` starts PostGIS on port 54329 and applies every file in `supabase/migrations` on first start. The default `DATABASE_URL` in `.env.example` points at it.

Run scrapers from the repo root:

```sh
bun run scrape --list
bun run scrape bonapp
bun run scrape wolt --dry-run --limit 40
bun run scrape
```

- `--list` prints the registered sources.
- `--dry-run` prints offers as JSON lines and writes nothing to the database.
- `--limit N` stops after N offers and skips deactivating offers the run did not see.
- No source name runs all of them.

Run the website on http://localhost:3001:

```sh
bun run dev
```

Checks:

```sh
bun run test
bun run check-types
```

### Environment

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | scrapers, web | Postgres connection string |
| `GEMINI_API_KEY` | scrapers | Optional. Without it, sources that need text extraction fall back to what they can parse directly |
| `GEMINI_MODEL` | scrapers | Default `gemini-2.5-flash-lite` |
| `GEMINI_RPM` | scrapers | Requests per minute, default 10 |
| `GEMINI_DAILY_BUDGET` | scrapers | Max Gemini calls per 24 hours, default 200 |
| `SCRAPER_CONTACT` | scrapers | Put in the user agent so site owners can reach you, e.g. `mailto:you@example.com` |

## Deploying

The project runs on free tiers: Supabase for Postgres, Vercel for the site, GitHub Actions for the scrapers.

**Database (Supabase).** Create a project and run the SQL files in `supabase/migrations` in filename order, either in the SQL editor or with `supabase db push`. PostGIS is enabled by the first migration. Copy the transaction pooler connection string (port 6543); that is your `DATABASE_URL`.

**Website (Vercel).** Import this repository. `vercel.json` points Vercel at `apps/web` with the TanStack Start preset and installs dependencies from the repo root with Bun. Set `DATABASE_URL` in the project's environment variables.

**Scrapers (GitHub Actions).** Add these repository secrets: `DATABASE_URL`, `GEMINI_API_KEY`, `SCRAPER_CONTACT`. The scheduled scrape workflow in `.github/workflows/scrape.yml` will run each source on its own schedule. GitHub turns off scheduled workflows in public repositories after 60 days without commits, so push something now and then.

## Status and terms

Bolt Food was skipped. Its web data had no merchant discounts when we checked, and its customer terms explicitly ban automated data collection.

The terms of Bonapp, Wolt and Glovo restrict reusing their content without written consent, even though their robots.txt files allow crawling. The maintainer is contacting them. Until then the site publishes facts only (venue, offer title, price, discount, schedule) and links every offer back to its source. It does not copy photos or menu descriptions.

Scrapers identify themselves in the user agent, wait at least 1.5 seconds between requests to the same host, back off on 429 and 5xx responses, and never log in, solve CAPTCHAs or decompile apps.
