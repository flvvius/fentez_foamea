import { BUCHAREST_BBOX, isInBucharest, type LatLon } from "@fentezfoamea/core";
import type { Sql } from "./db.ts";
import type { PoliteHttp } from "./http.ts";

type NominatimResult = { lat: string; lon: string; display_name: string };

export class Geocoder {
  constructor(
    private readonly sql: Sql | null,
    private readonly http: PoliteHttp,
  ) {}

  async locate(address: string): Promise<LatLon | undefined> {
    const query = address.trim().toLowerCase();
    if (!query) return undefined;

    const cached = await this.fromCache(query);
    if (cached !== undefined) return cached ?? undefined;

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({
      q: address,
      format: "jsonv2",
      limit: "1",
      countrycodes: "ro",
      viewbox: `${BUCHAREST_BBOX.west},${BUCHAREST_BBOX.north},${BUCHAREST_BBOX.east},${BUCHAREST_BBOX.south}`,
      bounded: "1",
    }).toString();
    const [hit] = await this.http.json<NominatimResult[]>(url.toString());
    const point = hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : undefined;
    const usable = point && isInBucharest(point) ? point : undefined;
    await this.saveCache(query, usable, hit?.display_name);
    return usable;
  }

  private async fromCache(query: string): Promise<LatLon | null | undefined> {
    if (!this.sql) return undefined;
    const [row] = await this.sql<{ lat: number | null; lon: number | null }[]>`
      select lat, lon from geocode_cache where query = ${query}
    `;
    if (!row) return undefined;
    return row.lat === null || row.lon === null ? null : { lat: row.lat, lon: row.lon };
  }

  private async saveCache(query: string, point: LatLon | undefined, displayName?: string): Promise<void> {
    if (!this.sql) return;
    await this.sql`
      insert into geocode_cache (query, lat, lon, display_name)
      values (${query}, ${point?.lat ?? null}, ${point?.lon ?? null}, ${displayName ?? null})
      on conflict (query) do nothing
    `;
  }
}
