const TZ = "Europe/Bucharest";

const priceFormat = new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const timeFormat = new Intl.DateTimeFormat("ro-RO", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("ro-RO", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });

export function formatPrice(value: number): string {
  return priceFormat.format(value);
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
  return hours < 24 ? `acum ${hours} h` : `acum ${Math.round(hours / 24)} zile`;
}

export function bucharestWeekday(now: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name) + 1;
}

export function minutesUntil(iso: string, now: Date): number {
  return Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
}

function sameBucharestDay(a: Date, b: Date): boolean {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
  return day.format(a) === day.format(b);
}
