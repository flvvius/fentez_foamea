import { bucharestLocalToIso, bucharestToday } from "@fentezfoamea/core";
import type { DealCard } from "@/server/deals/types";

type Schedule = Pick<DealCard, "validFrom" | "validUntil" | "daysOfWeek" | "timeStart" | "timeEnd">;

export type OpeningStatus =
  | { kind: "open"; closesAt: Date | null }
  | { kind: "opens"; at: Date; hasTime: boolean }
  | { kind: "none" };

const DAY_MS = 86_400_000;
const SHORT_WAIT_MS = 6 * 3_600_000;
// A deal runs on some weekday at least once a week; one extra day covers a window that starts
// late on the last day and an overnight window spilling in from yesterday.
const LOOKAHEAD_DAYS = 8;

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// ISO weekday, Monday = 1, matching deals.days_of_week.
function isoWeekday(date: string): number {
  return ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

function at(date: string, time: string): number {
  return Date.parse(bucharestLocalToIso(date, time) ?? `${date}T${time}:00Z`);
}

/**
 * Whether the deal is running right now and until when, or when it next starts. Days and hours
 * are read in Bucharest time, a window like 22:00–02:00 runs past midnight, and nothing counts
 * outside validFrom–validUntil.
 */
export function openingStatus(deal: Schedule, now: Date): OpeningStatus {
  const nowMs = now.getTime();
  const from = deal.validFrom ? Date.parse(deal.validFrom) : -Infinity;
  const until = Date.parse(deal.validUntil);
  if (!(until > nowMs)) return { kind: "none" };

  const days = deal.daysOfWeek && deal.daysOfWeek.length > 0 && deal.daysOfWeek.length < 7 ? deal.daysOfWeek : null;
  const hasTime = Boolean(deal.timeStart && deal.timeEnd);
  if (!days && !hasTime) {
    return from > nowMs ? { kind: "opens", at: new Date(from), hasTime: false } : { kind: "open", closesAt: null };
  }

  const startDay = bucharestToday(new Date(Math.max(nowMs, from)));
  for (let offset = -1; offset <= LOOKAHEAD_DAYS; offset++) {
    const date = addDays(startDay, offset);
    if (days && !days.includes(isoWeekday(date))) continue;
    let start = hasTime ? at(date, deal.timeStart!) : at(date, "00:00");
    let end = hasTime ? at(deal.timeStart! < deal.timeEnd! ? date : addDays(date, 1), deal.timeEnd!) : at(addDays(date, 1), "00:00");
    start = Math.max(start, from);
    end = Math.min(end, until);
    if (end <= start || end <= nowMs) continue;
    if (start <= nowMs) return { kind: "open", closesAt: hasTime || end === until ? new Date(end) : null };
    return { kind: "opens", at: new Date(start), hasTime };
  }
  return { kind: "none" };
}

const timeFormat = new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", hour: "2-digit", minute: "2-digit" });
const dayMonth = new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", day: "numeric", month: "short" });
const WEEKDAY_NAMES = ["luni", "marți", "miercuri", "joi", "vineri", "sâmbătă", "duminică"];

/** "peste 5 min", "peste 3 h 20 min". Waits of a day or more are counted in calendar days instead. */
export function formatWait(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `peste ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `peste ${hours} h ${rest} min` : `peste ${hours} h`;
}

/** "mâine", "peste 5 zile", "peste 21 de zile": Bucharest calendar days, so Thursday is 5 days from Saturday at any hour. */
export function formatDaysAway(days: number): string {
  if (days === 1) return "mâine";
  return days % 100 === 0 || days % 100 >= 20 ? `peste ${days} de zile` : `peste ${days} zile`;
}

function calendarDaysBetween(now: Date, then: Date): number {
  return Math.round((Date.parse(`${bucharestToday(then)}T12:00:00Z`) - Date.parse(`${bucharestToday(now)}T12:00:00Z`)) / DAY_MS);
}

/** The line shown on a deal: "Activă acum · până la 15:00", "Începe peste 3 h 20 min", ... */
export function formatOpening(status: OpeningStatus, now: Date): string | null {
  if (status.kind === "none") return null;
  if (status.kind === "open") {
    if (!status.closesAt) return "Activă acum";
    const sameDay = bucharestToday(status.closesAt) === bucharestToday(now);
    const closes = sameDay ? timeFormat.format(status.closesAt) : `${dayMonth.format(status.closesAt)}, ${timeFormat.format(status.closesAt)}`;
    return `Activă acum · până la ${closes}`;
  }
  const wait = status.at.getTime() - now.getTime();
  if (wait < DAY_MS && bucharestToday(status.at) === bucharestToday(now)) {
    return status.hasTime ? `Începe la ${timeFormat.format(status.at)} · ${formatWait(wait)}` : `Începe ${formatWait(wait)}`;
  }
  const day = bucharestToday(status.at);
  const daysAway = calendarDaysBetween(now, status.at);
  const named = daysAway < 7 ? WEEKDAY_NAMES[isoWeekday(day) - 1] : `pe ${dayMonth.format(status.at)}`;
  const time = status.hasTime ? ` la ${timeFormat.format(status.at)}` : "";
  // Just past midnight is still "in 3 h", not "tomorrow"; tomorrow at noon is "tomorrow", not "in 23 h".
  const when = wait < SHORT_WAIT_MS ? formatWait(wait) : formatDaysAway(daysAway);
  return `Începe ${named}${time} · ${when}`;
}
