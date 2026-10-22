import { describe, expect, it } from "vitest";
import {
  extractionNotes,
  LOW_CONFIDENCE_NOTE,
  minutesText,
  needsScreenshotMessage,
  submitErrorMessage,
  submitErrorMessageFromCode,
  voteErrorMessage,
  warningMessage,
} from "./messages";

describe("warningMessage", () => {
  it("maps the documented warnings", () => {
    expect(warningMessage("not_a_discount")).toContain("nu e reducere");
    expect(warningMessage("regular_price_unanchored")).toBe("Nu am putut confirma prețul normal din sursă.");
    expect(warningMessage("expiry_defaulted")).toBe("Nu am găsit până când e valabilă, așa că am pus 7 zile.");
    expect(warningMessage("already_expired")).toBe("Sursa pare să spună că oferta a expirat.");
    expect(warningMessage("not_a_deal")).toBe("Nu pare să fie o ofertă; verifică datele.");
  });

  it("uses one price line for every evidence warning", () => {
    const line = "Nu am găsit prețul în sursă, completează-l tu.";
    for (const w of ["price_not_in_evidence", "evidence_missing", "evidence_not_found", "evidence_too_long"] as const) {
      expect(warningMessage(w)).toBe(line);
    }
  });

  it("names the field of invalid_field warnings", () => {
    expect(warningMessage("invalid_field:dealPrice")).toContain("preț");
    expect(warningMessage("invalid_field:timeEnd")).toContain("ora de final");
  });

  it("has Romanian copy for every other warning", () => {
    for (const w of ["invalid_output", "percent_mismatch", "currency_mismatch", "expiry_clamped"] as const) {
      expect(warningMessage(w).length).toBeGreaterThan(10);
    }
  });
});

describe("extractionNotes", () => {
  it("dedupes lines and adds the low confidence note under 0.5", () => {
    const notes = extractionNotes({ warnings: ["price_not_in_evidence", "evidence_not_found", "expiry_defaulted"], confidence: 0.3 });
    expect(notes).toEqual([
      "Nu am găsit prețul în sursă, completează-l tu.",
      "Nu am găsit până când e valabilă, așa că am pus 7 zile.",
      LOW_CONFIDENCE_NOTE,
    ]);
  });

  it("has no note for a confident, clean extraction", () => {
    expect(extractionNotes({ warnings: [], confidence: 0.5 })).toEqual([]);
  });
});

describe("needsScreenshotMessage", () => {
  it("explains Instagram", () => {
    expect(needsScreenshotMessage("instagram")).toBe(
      "Instagram nu ne lasă să citim postarea. Adaugă o captură de ecran sau lipește textul postării.",
    );
  });
});

describe("submitErrorMessage", () => {
  it.each([
    ["url_not_allowed", "Linkul nu poate fi deschis."],
    ["budget_exhausted", "Completarea automată e oprită azi. Poți completa manual."],
    ["rate_limited:120", "Ai încercat de prea multe ori. Mai încearcă în 2 minute."],
    ["rate_limited:30", "Ai încercat de prea multe ori. Mai încearcă în 1 minut."],
    ["rate_limited:1200", "Ai încercat de prea multe ori. Mai încearcă în 20 de minute."],
  ])("maps %s", (code, message) => {
    expect(submitErrorMessage(new Error(code))).toBe(message);
  });

  it("maps image and source errors", () => {
    expect(submitErrorMessage(new Error("image_too_large"))).toContain("1,5 MB");
    expect(submitErrorMessage(new Error("invalid_image"))).toContain("JPEG, PNG sau WebP");
    expect(submitErrorMessage(new Error("source_required"))).toContain("link sau o captură");
    expect(submitErrorMessage(new Error("invalid_url"))).toContain("Linkul");
  });

  it("maps source_blocked", () => {
    expect(submitErrorMessage(new Error("source_blocked"))).toBe("Oferte de la această sursă nu mai pot fi postate.");
  });

  it("maps forbidden", () => {
    expect(submitErrorMessage(new Error("forbidden"))).toContain("Reîncarcă pagina");
  });

  it("falls back for unknown errors and non-errors", () => {
    expect(submitErrorMessage(new Error("boom"))).toBe("Ceva nu a mers. Încearcă din nou.");
    expect(submitErrorMessage("x")).toBe("Ceva nu a mers. Încearcă din nou.");
    expect(submitErrorMessageFromCode("invalid_image")).toContain("JPEG");
    expect(submitErrorMessageFromCode(undefined)).toBe("Ceva nu a mers. Încearcă din nou.");
  });
});

describe("voteErrorMessage", () => {
  it("maps vote codes", () => {
    expect(voteErrorMessage(new Error("rate_limited"))).toBe("Prea multe voturi. Încearcă din nou peste câteva secunde.");
    expect(voteErrorMessage(new Error("rate_limited:12"))).toBe("Prea multe voturi. Încearcă din nou peste 12 s.");
    expect(voteErrorMessage(new Error("deal_not_votable"))).toBe("Oferta nu mai e activă.");
    expect(voteErrorMessage(new Error("internal_error"))).toBe("Nu am putut salva votul.");
    expect(voteErrorMessage(new Error("???"))).toBe("Nu am putut salva votul.");
  });
});

describe("minutesText", () => {
  it("rounds up and pluralizes", () => {
    expect(minutesText(1)).toBe("1 minut");
    expect(minutesText(61)).toBe("2 minute");
    expect(minutesText(19 * 60)).toBe("19 minute");
    expect(minutesText(21 * 60)).toBe("21 de minute");
    expect(minutesText(3 * 3600)).toBe("3 ore");
    expect(minutesText(20 * 3600)).toBe("20 de ore");
  });
});
