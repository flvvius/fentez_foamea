import { bucharestLocalToIso, parseRonPrice } from "@fentezfoamea/core";

const WEEKDAYS: [RegExp, number][] = [
  [/(?<!\d\s?)\blun(i|ea)\b|#lunea/, 1],
  [/\bmart(i|ea)\b|#martea/, 2],
  [/\bmiercur(i|ea)\b|#miercurea/, 3],
  [/\bjo(i|ia)\b|#joia/, 4],
  [/\bviner(i|ea)\b|#vinerea/, 5],
  [/\bsambata\b|#sambata/, 6],
  [/\bduminic(a|ii)\b|#duminica/, 7],
];

const WEEKDAY_STEMS = "luni|marti|miercuri|joi|vineri|sambata|duminica";
const RANGE = new RegExp(String.raw`\b(?:de )?(${WEEKDAY_STEMS}) ?(?:[-–—]|pana(?: in| la)?) ?(${WEEKDAY_STEMS})\b`, "g");

const MONTHS: Record<string, number> = {
  ianuarie: 1,
  februarie: 2,
  martie: 3,
  aprilie: 4,
  mai: 5,
  iunie: 6,
  iulie: 7,
  august: 8,
  septembrie: 9,
  octombrie: 10,
  noiembrie: 11,
  decembrie: 12,
};

export function foldRomanian(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function parseWeekdays(text: string): number[] | undefined {
  const folded = foldRomanian(text);
  const days = new Set<number>();
  for (const match of folded.matchAll(RANGE)) {
    const from = weekdayNumber(match[1]);
    const to = weekdayNumber(match[2]);
    if (from && to && from <= to) for (let day = from; day <= to; day++) days.add(day);
  }
  if (days.size === 0) {
    for (const [pattern, day] of WEEKDAYS) if (pattern.test(folded)) days.add(day);
  }
  if (days.size === 0 || days.size === 7) return undefined;
  return [...days].sort((a, b) => a - b);
}

export function findLeiPrice(text: string): number | undefined {
  const match = /(\d{1,4}(?:[.,]\d{1,2})?) ?(?:lei|ron)\b/i.exec(text);
  return match ? parseRonPrice(match[1]) : undefined;
}

export type DateRange = { start: string; end: string };

export function parseDateRange(text: string): DateRange | undefined {
  const folded = foldRomanian(text);
  const numeric = /\b(\d{1,2})(?:\.(\d{1,2}))? ?[-–—] ?(\d{1,2})\.(\d{1,2})\.(\d{4})\b/.exec(folded);
  if (numeric) {
    const [, d1, m1, d2, m2, y] = numeric;
    return buildRange(Number(y), Number(m1 ?? m2), Number(d1), Number(m2), Number(d2));
  }
  const months = Object.keys(MONTHS).join("|");
  const worded = new RegExp(
    String.raw`\b(\d{1,2})(?: (${months}))?(?: (\d{4}))? ?(?:[-–—]|pana (?:in|la)) ?(\d{1,2}) (${months}) (\d{4})\b`,
  ).exec(folded);
  if (worded) {
    const [, d1, mon1, y1, d2, mon2, y2] = worded;
    const endMonth = MONTHS[mon2!]!;
    const startMonth = mon1 ? MONTHS[mon1]! : endMonth;
    const endYear = Number(y2);
    const startYear = y1 ? Number(y1) : inferStartYear(startMonth, endMonth, endYear);
    return buildRange(startYear, startMonth, Number(d1), endMonth, Number(d2), endYear);
  }
  return undefined;
}

export function dateRangeToIso(range: DateRange): { startsAt?: string; endsAt?: string } {
  return {
    startsAt: bucharestLocalToIso(range.start, "00:00"),
    endsAt: bucharestLocalToIso(range.end, "23:59"),
  };
}

const NO_DELIVERY = [
  /nu (?:este|e|sunt) (?:disponibil[ae]? )?(?:la|pentru|prin) (?:livrare|delivery)/,
  /nu se aplica (?:la |pentru |prin )?(?:livrari|livrare|delivery)/,
  /exceptia (?:serviciului )?(?:de )?(?:livrare|delivery)/,
];

const CONDITION_RULES: [RegExp[], string][] = [
  [NO_DELIVERY, "Nu se aplică la livrare"],
  [[/(?:doar|exclusiv|numai) (?:in|din|prin) (?:aplicati|app)/], "Doar în aplicație"],
  [[/locatiile selectate|restaurantele participante|restaurante selectate/], "Doar în restaurantele participante"],
  [[/click ?(?:&|and|si)? ?collect/], "Doar la comandă online cu ridicare"],
];

export function detectConditions(text: string): string[] {
  const folded = foldRomanian(text);
  return CONDITION_RULES.filter(([patterns]) => patterns.some((pattern) => pattern.test(folded))).map(([, label]) => label);
}

export function truncate(text: string, max = 200): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function inferStartYear(startMonth: number, endMonth: number, endYear: number): number {
  return startMonth > endMonth ? endYear - 1 : endYear;
}

function weekdayNumber(stem: string | undefined): number | undefined {
  if (!stem) return undefined;
  const index = WEEKDAY_STEMS.split("|").indexOf(stem);
  return index === -1 ? undefined : index + 1;
}

function buildRange(
  startYear: number,
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number,
  endYear = startYear,
): DateRange | undefined {
  const start = isoDate(startYear, startMonth, startDay);
  const end = isoDate(endYear, endMonth, endDay);
  return start && end && start <= end ? { start, end } : undefined;
}

function isoDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return undefined;
  return date.toISOString().slice(0, 10);
}
