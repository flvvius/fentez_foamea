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
      stale: row.stale ? "STALE" : "",
    })),
  );
  const stale = health.filter((row) => row.stale);
  if (stale.length) {
    console.error(`Stale sources: ${stale.map((row) => row.source).join(", ")}`);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
