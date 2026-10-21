export const BUCHAREST_TZ = "Europe/Bucharest";

export function bucharestLocalToIso(date: string, time: string): string | undefined {
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!dateMatch || !timeMatch) return undefined;
  const [, y, mo, d] = dateMatch.map(Number) as [number, number, number, number];
  const [, h, mi] = timeMatch.map(Number) as [number, number, number];
  if (h > 24 || mi > 59) return undefined;
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offsetMinutes = bucharestOffsetMinutes(new Date(asUtc));
  return new Date(asUtc - offsetMinutes * 60_000).toISOString();
}

export function bucharestToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUCHAREST_TZ }).format(now);
}

export function parseTimeRange(range: string): [string, string] | undefined {
  const match = range.match(/(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/);
  return match?.[1] && match[2] ? [match[1], match[2]] : undefined;
}

function bucharestOffsetMinutes(at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: BUCHAREST_TZ,
    timeZoneName: "longOffset",
  })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}
