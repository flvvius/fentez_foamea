import { BUCHAREST_CENTER, distanceMeters, isInBucharest } from "@fentezfoamea/core";
import { describe, expect, it } from "vitest";
import { Geocoder } from "../src/geocode.ts";
import type { PoliteHttp } from "../src/http.ts";
import { decodePlusCode, plusCodeIn } from "../src/plus-code.ts";

const zurich = { lat: 47.365590, lon: 8.524997 };

describe("plus codes", () => {
  it("decodes a full code to the centre of its 14 m cell", () => {
    expect(distanceMeters(decodePlusCode("8FVC9G8F+6X", BUCHAREST_CENTER)!, zurich)).toBeLessThan(15);
  });

  it("recovers a short code from a nearby reference", () => {
    expect(distanceMeters(decodePlusCode("9G8F+6X", { lat: 47.4, lon: 8.6 })!, zurich)).toBeLessThan(15);
  });

  it("finds codes in Glovo addresses and places them in Bucharest", () => {
    expect(plusCodeIn("C2MX+8RW Bucharest 11, C2MX+8RW Bucharest Bucharest")).toBe("C2MX+8RW");
    expect(plusCodeIn("F4R9+QC, Voluntari, București")).toBe("F4R9+QC");
    expect(plusCodeIn("Strada Traian 126, București")).toBeUndefined();
    for (const code of ["C2MX+8RW", "F3JQ+JVP", "F4R9+QC", "C4J9+XXW"]) {
      expect(isInBucharest(decodePlusCode(code, BUCHAREST_CENTER)!)).toBe(true);
    }
  });
});

describe("Geocoder with a plus code", () => {
  it("places the address without asking Nominatim", async () => {
    const http = { json: () => Promise.reject(new Error("no network")) } as unknown as PoliteHttp;
    const point = await new Geocoder(null, http).locate("C2MX+8RW Bucharest 11");
    expect(point && isInBucharest(point)).toBe(true);
  });
});
