const TZ = "Europe/Bucharest";

const wholePriceFormat = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 });
const centsPriceFormat = new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const timeFormat = new Intl.DateTimeFormat("ro-RO", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("ro-RO", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const weekdayFormat = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" });
const clockFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const calendarDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

export function formatPrice(value: number): string {
  return (Number.isInteger(value) ? wholePriceFormat : centsPriceFormat).format(value);
}

export function countOffers(count: number): string {
  if (count === 1) return "1 ofertă";
  const lastTwo = count % 100;
  return lastTwo === 0 || lastTwo >= 20 ? `${count} de oferte` : `${count} oferte`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0).replace(".", ",")} km`;
}

export function formatPickup(start: string, end: string, now: Date): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const range = `${timeFormat.format(startDate)}–${timeFormat.format(endDate)}`;
  return sameBucharestDay(startDate, now) ? `azi ${range}` : `${dayFormat.format(startDate)}, ${range}`;
}

export function formatRelative(iso: string, now: Date): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "chiar acum";
  if (minutes < 60) return `acum ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `acum ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ieri";
  // Romanian puts "de" before counts whose last two digits are 0 or 20 and up: 20, 100, 120.
  const lastTwo = days % 100;
  return lastTwo === 0 || lastTwo >= 20 ? `acum ${days} de zile` : `acum ${days} zile`;
}

export function bucharestWeekday(now: Date): number {
  const name = weekdayFormat.format(now);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name) + 1;
}

export function bucharestClock(now: Date): string {
  return clockFormat.format(now);
}

export function minutesUntil(iso: string, now: Date): number {
  return Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
}

export function sameBucharestDay(a: Date, b: Date): boolean {
  return calendarDayFormat.format(a) === calendarDayFormat.format(b);
}
