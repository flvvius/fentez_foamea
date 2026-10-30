import type { ExtractionResult, ExtractionWarning } from "@fentezfoamea/core";
import { submitErrorCode, submitRetryAfter } from "@/server/submit/errors";
import type { NeedsScreenshotReason } from "@/server/submit/types";
import { voteErrorCode, voteRetryAfter } from "@/server/deals/vote-errors";

/** "1 minut", "5 minute", "20 de minute"; from two hours on, "1 oră"-style hours: "3 ore", "20 de ore". */
export function minutesText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes >= 120) {
    const hours = Math.ceil(minutes / 60);
    return hours % 100 === 0 || hours % 100 >= 20 ? `${hours} de ore` : `${hours} ore`;
  }
  if (minutes === 1) return "1 minut";
  return minutes >= 20 ? `${minutes} de minute` : `${minutes} minute`;
}

export const FIELD_LABELS: Record<string, string> = {
  restaurantName: "restaurant",
  title: "titlu",
  description: "descriere",
  dealType: "tip ofertă",
  dealPrice: "preț",
  regularPrice: "preț normal",
  percentOff: "procent",
  currency: "monedă",
  daysOfWeek: "zile",
  timeStart: "ora de început",
  timeEnd: "ora de final",
  validFrom: "valabil de la",
  validUntil: "valabil până la",
  channel: "canal",
  flags: "condiții",
  promoCode: "cod promoțional",
  address: "adresă",
  lat: "adresă",
  lon: "adresă",
};

const PRICE_NOT_FOUND = "Nu am găsit prețul în sursă, completează-l tu.";

export function warningMessage(warning: ExtractionWarning): string {
  switch (warning) {
    case "not_a_discount":
      return "Prețul ofertei nu e mai mic decât cel normal, așa că o arătăm ca „nu e reducere”.";
    case "price_not_in_evidence":
    case "evidence_missing":
    case "evidence_not_found":
    case "evidence_too_long":
      return PRICE_NOT_FOUND;
    case "regular_price_unanchored":
      return "Nu am putut confirma prețul normal din sursă.";
    case "expiry_defaulted":
      return "Nu am găsit până când e valabilă, așa că am pus 7 zile.";
    case "expiry_clamped":
      return "Data de final părea prea îndepărtată, așa că am scurtat-o. Verific-o.";
    case "already_expired":
      return "Sursa pare să spună că oferta a expirat.";
    case "year_corrected":
      return "Sursa nu scrie anul, așa că am pus anul în curs la date. Verifică-le.";
    case "not_a_deal":
      return "Nu pare să fie o ofertă; verifică datele.";
    case "percent_mismatch":
      return "Procentul din sursă nu se potrivește cu prețurile. Verifică-l.";
    case "currency_mismatch":
      return "Moneda din sursă pare diferită. Verific-o.";
    case "invalid_output":
      return "Nu am înțeles bine sursa, așa că verifică toate câmpurile.";
    default: {
      if (warning.startsWith("invalid_field:")) {
        const label = FIELD_LABELS[warning.slice("invalid_field:".length)];
        return label ? `Nu am putut citi câmpul „${label}”. Completează-l tu.` : "Un câmp nu a putut fi citit. Completează-l tu.";
      }
      return "Verifică datele completate automat.";
    }
  }
}

export const LOW_CONFIDENCE_NOTE = "Nu suntem siguri de ce am citit. Verifică fiecare câmp înainte să publici.";

/** One line per distinct message, in the order the warnings came, plus the low-confidence note. */
export function extractionNotes(extraction: Pick<ExtractionResult, "warnings" | "confidence">): string[] {
  const lines: string[] = [];
  for (const warning of extraction.warnings) {
    const line = warningMessage(warning);
    if (!lines.includes(line)) lines.push(line);
  }
  if (extraction.confidence < 0.5 && !lines.includes(LOW_CONFIDENCE_NOTE)) lines.push(LOW_CONFIDENCE_NOTE);
  return lines;
}

export const EXTRACTION_UNAVAILABLE = "Nu am putut completa automat. Completează câmpurile de mai jos.";

export function needsScreenshotMessage(reason: NeedsScreenshotReason): string {
  switch (reason) {
    case "instagram":
      return "Instagram nu ne lasă să citim postarea. Adaugă o captură de ecran sau lipește textul postării.";
    case "unsupported_platform":
      return "Nu putem citi automat linkul ăsta. Adaugă o captură de ecran sau lipește textul postării.";
    case "fetch_failed":
      return "Nu am reușit să deschidem pagina. Adaugă o captură de ecran sau completează manual.";
    case "unsupported_content":
      return "Pagina nu are un conținut pe care îl putem citi. Adaugă o captură de ecran sau completează manual.";
    case "empty":
      return "Nu am găsit text pe pagină. Adaugă o captură de ecran sau completează manual.";
  }
}

export const GENERIC_ERROR = "Ceva nu a mers. Încearcă din nou.";

/** Message for a submit/extract/upload error code ("rate_limited:120", "invalid_image", ...). */
export function submitErrorMessage(error: unknown): string {
  const code = submitErrorCode(error);
  switch (code) {
    case "unauthorized":
      return "Trebuie să fii autentificat. Intră în cont și încearcă din nou.";
    case "forbidden":
      return "Cererea a fost refuzată. Reîncarcă pagina și încearcă din nou.";
    case "invalid_input":
    case "invalid_url":
      return "Linkul nu pare valid. Verifică-l și încearcă din nou.";
    case "url_not_allowed":
      return "Linkul nu poate fi deschis.";
    case "rate_limited": {
      const seconds = submitRetryAfter(error);
      return seconds === null
        ? "Ai încercat de prea multe ori. Mai încearcă mai târziu."
        : `Ai încercat de prea multe ori. Mai încearcă în ${minutesText(seconds)}.`;
    }
    case "budget_exhausted":
      return "Completarea automată e oprită azi. Poți completa manual.";
    case "image_too_large":
      return "Captura e prea mare (maxim 1,5 MB). Alege una mai mică.";
    case "invalid_image":
      return "Captura trebuie să fie o imagine JPEG, PNG sau WebP.";
    case "image_not_found":
      return "Nu am găsit captura încărcată. Alege-o din nou.";
    case "source_required":
      return "Adaugă un link sau o captură de ecran ca sursă.";
    case "source_blocked":
      return "Oferte de la această sursă nu mai pot fi postate.";
    case "invalid_draft":
      return "Unele câmpuri nu sunt valide. Verifică formularul.";
    case "internal_error":
    case null:
      return GENERIC_ERROR;
  }
}

/** For a code that arrived as a string (the upload endpoint answers { error: code }). */
export function submitErrorMessageFromCode(code: unknown): string {
  return submitErrorMessage(new Error(typeof code === "string" ? code : "internal_error"));
}

export function voteErrorMessage(error: unknown): string {
  switch (voteErrorCode(error)) {
    case "rate_limited": {
      const seconds = voteRetryAfter(error);
      return seconds === null
        ? "Prea multe voturi. Încearcă din nou peste câteva secunde."
        : `Prea multe voturi. Încearcă din nou peste ${seconds} s.`;
    }
    case "deal_not_votable":
    case "deal_not_found":
      return "Oferta nu mai e activă.";
    default:
      return "Nu am putut salva votul.";
  }
}
