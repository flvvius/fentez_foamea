export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(restaurant|bistro|cafe|caffe|the|srl)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

export function venueMatchKey(name: string, lat?: number, lon?: number): string {
  const base = normalizeName(name);
  if (lat === undefined || lon === undefined) return base;
  return `${base}@${lat.toFixed(3)},${lon.toFixed(3)}`;
}

const INVISIBLE = /[\u00AD\u200B-\u200D\u2060\uFEFF\uFFFD]/g;

export function collapseWhitespace(text: string): string {
  return text.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}
