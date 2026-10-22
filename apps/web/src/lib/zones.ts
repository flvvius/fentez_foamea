import type { LatLon } from "@fentezfoamea/core";

export type Zone = LatLon & { slug: string; name: string };

export const ZONES: Zone[] = [
  { slug: "universitate", name: "Universitate", lat: 44.4355, lon: 26.1025 },
  { slug: "unirii", name: "Piața Unirii", lat: 44.4275, lon: 26.1039 },
  { slug: "romana", name: "Piața Romană și ASE", lat: 44.4467, lon: 26.0975 },
  { slug: "victoriei", name: "Piața Victoriei", lat: 44.452, lon: 26.086 },
  { slug: "politehnica", name: "Politehnica", lat: 44.4405, lon: 26.0525 },
  { slug: "regie", name: "Regie și Grozăvești", lat: 44.4435, lon: 26.0615 },
  { slug: "gara-de-nord", name: "Gara de Nord", lat: 44.4465, lon: 26.0735 },
  { slug: "cotroceni", name: "Cotroceni și Eroilor", lat: 44.4325, lon: 26.0765 },
  { slug: "aviatorilor", name: "Aviatorilor și Herăstrău", lat: 44.463, lon: 26.086 },
  { slug: "floreasca", name: "Floreasca", lat: 44.464, lon: 26.105 },
  { slug: "pipera", name: "Pipera", lat: 44.503, lon: 26.137 },
  { slug: "obor", name: "Obor", lat: 44.45, lon: 26.126 },
  { slug: "tineretului", name: "Tineretului", lat: 44.412, lon: 26.105 },
  { slug: "berceni", name: "Berceni", lat: 44.387, lon: 26.117 },
  { slug: "titan", name: "Titan", lat: 44.4205, lon: 26.174 },
  { slug: "dristor", name: "Dristor", lat: 44.42, lon: 26.142 },
  { slug: "drumul-taberei", name: "Drumul Taberei", lat: 44.42, lon: 26.03 },
  { slug: "militari", name: "Militari", lat: 44.435, lon: 26.015 },
  { slug: "crangasi", name: "Crângași", lat: 44.452, lon: 26.045 },
  { slug: "baneasa", name: "Băneasa", lat: 44.501, lon: 26.079 },
];

export const ZONE_RADIUS_KM = 1;

export function findZone(slug: string): Zone | undefined {
  return ZONES.find((zone) => zone.slug === slug);
}
