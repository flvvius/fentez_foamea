import { describe, expect, it } from "vitest";
import { Geocoder } from "../src/geocode.ts";
import type { PoliteHttp } from "../src/http.ts";

function fakeNominatim(known: Record<string, { lat: string; lon: string }>) {
  const asked: string[] = [];
  const http = {
    json: async (url: string) => {
      const query = new URL(url).searchParams.get("q")!;
      asked.push(query);
      const hit = known[query];
      return hit ? [{ ...hit, display_name: query }] : [];
    },
  } as unknown as PoliteHttp;
  return { http, asked };
}

describe("Geocoder", () => {
  it("tries cleaned versions of a messy address until one is found", async () => {
    const { http, asked } = fakeNominatim({ "Calea Floreasca 246b, București": { lat: "44.478", lon: "26.103" } });
    const geocoder = new Geocoder(null, http);

    await expect(geocoder.locate("Promenada, Calea Floreasca 246b, MEHEDINŢI Bucharest")).resolves.toEqual({ lat: 44.478, lon: 26.103 });
    expect(asked).toEqual(["Promenada, Calea Floreasca 246b, București", "Calea Floreasca 246b, București"]);
  });

  it("asks once per address and rejects points outside Bucharest", async () => {
    const { http, asked } = fakeNominatim({ "Strada Traian 126, București": { lat: "45.7", lon: "21.2" } });
    const geocoder = new Geocoder(null, http);

    await expect(geocoder.locate("Strada Traian 126, ILFOV Bucharest")).resolves.toBeUndefined();
    await expect(geocoder.locate("strada traian 126, ilfov bucharest")).resolves.toBeUndefined();
    expect(asked).toEqual(["Strada Traian 126, București"]);
  });
});
