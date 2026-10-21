import { parseArgs } from "node:util";
import { connect, purgeOld, type Sql } from "./db.ts";
import { GeminiExtractor } from "./gemini.ts";
import { Geocoder } from "./geocode.ts";
import { PoliteHttp } from "./http.ts";
import { createLogger } from "./log.ts";
import { runSource, type RunSummary } from "./pipeline.ts";
import { SOURCES } from "./sources/index.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "dry-run": { type: "boolean", default: false },
    limit: { type: "string" },
    list: { type: "boolean", default: false },
  },
});

if (values.list) {
  for (const source of Object.values(SOURCES)) console.log(`${source.id}\t${source.description}`);
  process.exit(0);
}

const requested = positionals.length === 0 || positionals.includes("all") ? Object.keys(SOURCES) : positionals;
const unknown = requested.filter((id) => !(id in SOURCES));
if (unknown.length) {
  console.error(`Unknown source(s): ${unknown.join(", ")}. Known: ${Object.keys(SOURCES).join(", ")}`);
  process.exit(2);
}

const log = createLogger("cli");
const sql: Sql | null = values["dry-run"] ? null : connect();
const http = new PoliteHttp(log);
const sink = values["dry-run"] ? { write: async (offer: unknown) => void process.stdout.write(`${JSON.stringify(offer)}\n`) } : undefined;

const summaries: RunSummary[] = [];
try {
  for (const id of requested) {
    const source = SOURCES[id as keyof typeof SOURCES];
    const sourceLog = createLogger(source.id);
    const summary = await runSource(
      source,
      {
        http,
        log: sourceLog,
        geocoder: new Geocoder(sql, http),
        gemini: GeminiExtractor.fromEnv(sql, sourceLog),
        limit: values.limit ? Number(values.limit) : undefined,
      },
      sql,
      sink,
    );
    sourceLog.info("finished", summary);
    summaries.push(summary);
  }
  if (sql) await purgeOld(sql);
} finally {
  await sql?.end();
}

if (summaries.some((summary) => summary.status === "failed")) process.exitCode = 1;
