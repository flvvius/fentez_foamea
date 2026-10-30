import { appendFileSync } from "node:fs";
import { SOURCE_IDS } from "@fentezfoamea/core";
import { connect } from "./db.ts";
import { checkHealth, type LastRun } from "./health.ts";

const sql = connect();
try {
  const runs = await sql<LastRun[]>`
    select source,
           max(finished_at) filter (where status = 'ok') as "lastOk",
           (array_agg(status order by started_at desc))[1] as "lastStatus",
           (array_agg(error order by started_at desc))[1] as "lastError"
    from scrape_runs
    group by source
  `;
  const health = checkHealth(runs, [...SOURCE_IDS], new Date());
  console.table(
    health.map((row) => ({
      source: row.source,
      "hours since ok": row.ageHours === null ? "never" : row.ageHours.toFixed(1),
      limit: row.limitHours,
      last: row.lastStatus,
      error: row.lastError?.slice(0, 80) ?? "",
      verdict: row.verdict,
    })),
  );
  const sourcesWith = (verdict: string) => health.filter((row) => row.verdict === verdict).map((row) => row.source);
  const missed = sourcesWith("missed");
  const running = sourcesWith("running");
  const broken = sourcesWith("broken");
  if (missed.length) console.log(`::warning::Scheduled runs missed, catching up: ${missed.join(", ")}`);
  if (running.length) console.log(`::warning::Stale but a run is in progress: ${running.join(", ")}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `catch_up=${missed.join(" ")}\n`);
  if (broken.length) {
    console.error(`Stale sources whose last run failed: ${broken.join(", ")}`);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
