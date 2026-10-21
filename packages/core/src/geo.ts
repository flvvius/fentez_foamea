export type LatLon = { lat: number; lon: number };

export const BUCHAREST_CENTER: LatLon = { lat: 44.4355, lon: 26.1025 };

export const BUCHAREST_BBOX = {
  south: 44.33,
  west: 25.96,
  north: 44.55,
  east: 26.26,
};

export function isInBucharest({ lat, lon }: LatLon): boolean {
  return (
    lat >= BUCHAREST_BBOX.south &&
    lat <= BUCHAREST_BBOX.north &&
    lon >= BUCHAREST_BBOX.west &&
    lon <= BUCHAREST_BBOX.east
  );
}

export function distanceMeters(a: LatLon, b: LatLon): number {
  const earthRadius = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

export function bucharestGrid(spacingMeters: number): LatLon[] {
  const metersPerDegLat = 111_320;
  const metersPerDegLon = metersPerDegLat * Math.cos((BUCHAREST_CENTER.lat * Math.PI) / 180);
  const latStep = spacingMeters / metersPerDegLat;
  const lonStep = spacingMeters / metersPerDegLon;
  const points: LatLon[] = [];
  for (let lat = BUCHAREST_BBOX.south + latStep / 2; lat < BUCHAREST_BBOX.north; lat += latStep) {
    for (let lon = BUCHAREST_BBOX.west + lonStep / 2; lon < BUCHAREST_BBOX.east; lon += lonStep) {
      points.push({ lat: round(lat, 5), lon: round(lon, 5) });
    }
  }
  return points;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
