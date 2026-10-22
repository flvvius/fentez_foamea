import type { SourceId } from "@fentezfoamea/core";

export type LastRun = { source: string; lastOk: Date | null; lastStatus: string | null; lastError: string | null };
export type SourceHealth = LastRun & { ageHours: number | null; limitHours: number; stale: boolean };

const DAYTIME_UTC = { from: 5, to: 20 };

const LIMIT_HOURS: Record<SourceId, number> = {
  bonapp: 2,
  wolt: 12,
  glovo: 12,
  kfc: 30,
  pizzahut: 30,
  tacobell: 30,
  dominos: 30,
  paul: 30,
  citygrill: 30,
};

export function checkHealth(runs: LastRun[], sources: SourceId[], now: Date): SourceHealth[] {
  const daytime = now.getUTCHours() >= DAYTIME_UTC.from && now.getUTCHours() < DAYTIME_UTC.to;
  return sources.map((source) => {
    const run = runs.find((candidate) => candidate.source === source) ?? { source, lastOk: null, lastStatus: null, lastError: null };
    const limitHours = source === "bonapp" && !daytime ? 12 : LIMIT_HOURS[source];
    const ageHours = run.lastOk ? (now.getTime() - run.lastOk.getTime()) / 3_600_000 : null;
    return { ...run, ageHours, limitHours, stale: ageHours === null || ageHours > limitHours };
  });
}
