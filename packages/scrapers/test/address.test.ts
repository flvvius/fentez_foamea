import { describe, expect, it } from "vitest";
import { addressCandidates } from "../src/address.ts";

describe("addressCandidates", () => {
  it.each([
    ["Bld Timișoara nr. 26, București", "Bulevardul Timișoara 26, București"],
    ["Calea Victoriei 208, MEHEDINŢI Bucharest", "Calea Victoriei 208, București"],
    ["Strada Traian 126, ILFOV Bucharest", "Strada Traian 126, București"],
    ["strada biruintei nr 31 31, bucurești", "strada biruintei 31, București"],
    ["Strada Puțul lui Zamfir 13, 0 București București", "Strada Puțul lui Zamfir 13, București"],
    ["calea mosilor 219, romanai bucharest", "calea mosilor 219, București"],
    ["Bulevardul Iuliu Maniu 7, BUCUREŞTI LifeBox", "Bulevardul Iuliu Maniu 7, București"],
    ["Str. Amurgului 46, Popești-Leordeni, București", "Strada Amurgului 46, Popești-Leordeni"],
    ["Bulevardul Pipera 64, Județul Ilfov Voluntari, București", "Bulevardul Pipera 64, Voluntari"],
    ["str. Tineretului 66, Ilfov County Roșu, București", "Strada Tineretului 66, Roșu"],
    ["strada covasna 32, ilfov bucurești", "strada covasna 32, București"],
    ["Strada Amiral Ioan Murgescu 79, 0 Argeş București", "Strada Amiral Ioan Murgescu 79, București"],
  ])("cleans %s", (raw, expected) => {
    expect(addressCandidates(raw)).toContain(expected);
  });

  it("falls back to the street line, then to the first number of a range", () => {
    expect(addressCandidates("Promenada, Calea Floreasca 246b, Bucharest")).toEqual([
      "Promenada, Calea Floreasca 246b, București",
      "Calea Floreasca 246b, București",
    ]);
    expect(addressCandidates("Șoseaua Olteniței 39-45, CONSTANŢA București")).toEqual([
      "Șoseaua Olteniței 39-45, București",
      "Șoseaua Olteniței 39, București",
    ]);
  });

  it("gives up on plus codes", () => {
    expect(addressCandidates("F3JQ+JVP Bucharest")).toEqual([]);
  });
});
