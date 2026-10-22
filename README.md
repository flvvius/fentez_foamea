# fentez foamea

fentez foamea puts cheap food in Bucharest on one map: surplus bags restaurants would otherwise throw away, lunch menus, weekday chain deals and delivery-app discounts. Scrapers collect offers from public sources into Postgres. A small website shows what is open near you right now and links each offer back to where you can buy it.

The UI is in Romanian. The code and docs are in English. For how the parts fit together, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Sources

Counts are from a local run on a Wednesday in October 2026.

| Source | What it contributes | Offers | Schedule |
|---|---|---|---|
| Bonapp | Surplus bags with pickup windows and stock, from 218 venues | ~480 | every 30 min, 07:00-22:00 |
| Wolt | Merchant campaigns (percent off, whole menu, free items) and up to 5 discounted items per venue | ~1200 per run, from 600 of ~2300 venues | 3 times a day |
| Glovo | Store promos (-X% on some items, whole menu, 1+1) and up to 5 discounted items per store | ~2200 | 3 times a day |
| KFC | Deals on every Bucharest restaurant, or only on the participating ones | 34 | daily |
| Taco Bell | Weekday deals (Taco Tuesday, Burrito Day) and combos at 6 restaurants | 48 | daily |
| Pizza Hut | Weekday deals, boxes and menus at 14 restaurants | 182 | daily |
| Domino's | Homepage deals at 21 stores | 105 | daily |
| Paul | Bakery offers, lunch menus, 1+1 days at 11 bakeries | 102 | daily |
| City Grill group | 40,9 lei lunch menu, 1+1, student and pensioner menus at 7 restaurants | 30 | daily |

Chain deals repeat per store so they show on the map near you. The list collapses them to the nearest store.

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

End-to-end tests build the site and drive it with Playwright against a seeded database called `fentezfoamea_e2e`, created on the local PostGIS. Install Chromium once with `bunx playwright install chromium`, then:

```sh
cd apps/web
bun run build
bun run e2e
bun run e2e:live
```

`e2e:live` runs a short smoke test against the deployed site, or against `LIVE_URL` if set. `bun run --cwd packages/scrapers health` prints how long ago each source last ran successfully.

### Environment

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | scrapers, web | Postgres connection string |
| `GEMINI_API_KEY` | scrapers | Optional. Without it, sources that need text extraction fall back to what they can parse directly |
| `GEMINI_MODEL` | scrapers | Default `gemini-2.5-flash-lite` |
| `GEMINI_RPM` | scrapers | Requests per minute, default 10 |
| `GEMINI_DAILY_BUDGET` | scrapers | Max Gemini calls per 24 hours, default 200 |
| `SCRAPER_CONTACT` | scrapers | Put in the user agent so site owners can reach you. Use a real URL or address: Nominatim blocks `example.com` |
| `WOLT_MAX_VENUES` | scrapers | Wolt venues checked per run, default 600 |

## Deploying

The project runs on free tiers: Supabase for Postgres, Vercel for the site, GitHub Actions for the scrapers.

**Database (Supabase).** Create a project and run the SQL files in `supabase/migrations` in filename order, either in the SQL editor or with `supabase db push`. PostGIS is enabled by the first migration. Copy the session pooler connection string (port 5432); that is your `DATABASE_URL`. The transaction pooler on port 6543 accepted connections but never answered the Postgres handshake in testing, so use 5432 unless you have checked 6543 yourself.

**Website (Vercel).** Import this repository. `vercel.json` points Vercel at `apps/web` with the TanStack Start preset and installs dependencies from the repo root with Bun. Set `DATABASE_URL` in the project's environment variables.

**Scrapers (GitHub Actions).** Add these repository secrets: `DATABASE_URL`, `GEMINI_API_KEY`, `SCRAPER_CONTACT`. The scheduled workflow in `.github/workflows/scrape.yml` runs Bonapp every 30 minutes in the daytime, Wolt and Glovo three times a day and the chain sites once a day. You can also start it by hand from the Actions tab with a list of sources. GitHub turns off scheduled workflows in public repositories after 60 days without commits. The hourly `health` workflow re-enables them, checks that every source had a successful run within its schedule (2 hours for Bonapp in the daytime, 12 for Wolt and Glovo, 30 for the chains) and smoke-tests the live site. It fails when either check does, and GitHub emails you about failed scheduled runs.

## Status and terms

Bolt Food was skipped. Its web data had no merchant discounts when we checked, and its customer terms explicitly ban automated data collection.

The terms of Bonapp, Wolt and Glovo restrict reusing their content without written consent, even though their robots.txt files allow crawling. The maintainer is contacting them. Until then the site publishes facts only (venue, offer title, price, discount, schedule) and links every offer back to its source. It does not copy photos or menu descriptions.

Scrapers identify themselves in the user agent, wait at least 1.5 seconds between requests to the same host, back off on 429 and 5xx responses, and never log in, solve CAPTCHAs or decompile apps.
