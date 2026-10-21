import { describe, expect, it } from "vitest";
import { BUCHAREST_CENTER, bucharestGrid, distanceMeters, isInBucharest } from "./geo.ts";

describe("geo", () => {
  it("measures Piata Unirii to Piata Victoriei at about 3 km", () => {
    const d = distanceMeters({ lat: 44.4268, lon: 26.1025 }, { lat: 44.4521, lon: 26.0857 });
    expect(d).toBeGreaterThan(2900);
    expect(d).toBeLessThan(3300);
  });

  it("builds a grid inside the city box", () => {
    const grid = bucharestGrid(3000);
    expect(grid.length).toBeGreaterThan(30);
    expect(grid.every(isInBucharest)).toBe(true);
    expect(isInBucharest(BUCHAREST_CENTER)).toBe(true);
  });
});
