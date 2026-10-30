import {
  bucharestLocalToIso,
  bucharestToday,
  DEAL_FLAGS,
  dealDraftSchema,
  type DealChannel,
  type DealDraft,
  type DealDraftInput,
  type DealFlag,
  type DealType,
  type ExtractionDraft,
} from "@fentezfoamea/core";
import { isNotADiscount } from "./deal-display";

/** Everything the post form edits, as the strings and booleans the inputs hold. */
export type FormState = {
  restaurantName: string;
  title: string;
  description: string;
  dealType: DealType;
  dealPrice: string;
  regularPrice: string;
  percentOff: string;
  currency: string;
  channel: DealChannel;
  /** In DEAL_FLAGS order. */
  flags: DealFlag[];
  promoCode: string;
  /** ISO weekdays, Monday = 1. */
  daysOfWeek: number[];
  /** "HH:MM" or "". */
  timeStart: string;
  timeEnd: string;
  /** "YYYY-MM-DD" (a Bucharest calendar day) or "". */
  validFrom: string;
  validUntil: string;
  address: string;
};

export type FormField = keyof FormState;
export type FormErrors = Partial<Record<FormField, string>>;

export const FORM_FIELDS: readonly FormField[] = [
  "restaurantName",
  "title",
  "description",
  "dealType",
  "dealPrice",
  "regularPrice",
  "percentOff",
  "currency",
  "channel",
  "flags",
  "promoCode",
  "daysOfWeek",
  "timeStart",
  "timeEnd",
  "validFrom",
  "validUntil",
  "address",
];

export function emptyForm(): FormState {
  return {
    restaurantName: "",
    title: "",
    description: "",
    dealType: "other",
    dealPrice: "",
    regularPrice: "",
    percentOff: "",
    currency: "RON",
    channel: "in_store",
    flags: [],
    promoCode: "",
    daysOfWeek: [],
    timeStart: "",
    timeEnd: "",
    validFrom: "",
    validUntil: "",
    address: "",
  };
}

// --- Numbers and dates --------------------------------------------------------------

/** "" is null; "12,50" and "12.50" are 12.5; anything unreadable is NaN (so validation rejects it). */
export function parseNumberInput(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!/^-?\d+([.,]\d+)?$/.test(trimmed)) return Number.NaN;
  return Number(trimmed.replace(",", "."));
}

export function numberToInput(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/** The Bucharest calendar day of an instant, for a date input. "" for null or unreadable input. */
export function isoToBucharestDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : bucharestToday(at);
}

/** 00:00 Bucharest time on `date`, as an ISO instant (DST-aware). */
export function bucharestDayStartIso(date: string): string | null {
  return bucharestLocalToIso(date, "00:00") ?? null;
}

/** 23:59:59 Bucharest time on `date`, as an ISO instant (DST-aware). */
export function bucharestDayEndIso(date: string): string | null {
  const iso = bucharestLocalToIso(date, "23:59");
  return iso === undefined ? null : new Date(Date.parse(iso) + 59_000).toISOString();
}

/** Without repeats, in the order the form lists them. */
export function sortFlags(flags: readonly DealFlag[]): DealFlag[] {
  return DEAL_FLAGS.filter((flag) => flags.includes(flag));
}

const orNull = (text: string): string | null => (text.trim() === "" ? null : text.trim());

// --- Form <-> draft -------------------------------------------------------------------

/** Pre-fills the form from an extraction. Null fields become empty inputs. */
export function formFromDraft(draft: ExtractionDraft): FormState {
  return {
    restaurantName: draft.restaurantName ?? "",
    title: draft.title ?? "",
    description: draft.description ?? "",
    dealType: draft.dealType,
    dealPrice: numberToInput(draft.dealPrice),
    regularPrice: numberToInput(draft.regularPrice),
    percentOff: numberToInput(draft.percentOff),
    currency: draft.currency || "RON",
    channel: draft.channel,
    flags: sortFlags(draft.flags ?? []),
    promoCode: draft.promoCode ?? "",
    daysOfWeek: draft.daysOfWeek ? [...new Set(draft.daysOfWeek)].sort((a, b) => a - b) : [],
    timeStart: draft.timeStart ?? "",
    timeEnd: draft.timeEnd ?? "",
    validFrom: isoToBucharestDate(draft.validFrom),
    validUntil: isoToBucharestDate(draft.validUntil),
    address: draft.address ?? "",
  };
}

/**
 * The draft the server validates. Empty inputs are null, dates become Bucharest start/end of
 * day, and the promo code is dropped unless the channel is "promo_code". Numbers that can't be
 * read stay NaN so dealDraftSchema reports them.
 */
export function draftFromForm(form: FormState): DealDraftInput {
  const from = form.validFrom ? (bucharestDayStartIso(form.validFrom) ?? form.validFrom) : null;
  const until = form.validUntil ? (bucharestDayEndIso(form.validUntil) ?? form.validUntil) : null;
  return {
    restaurantName: form.restaurantName,
    title: form.title,
    description: orNull(form.description),
    dealType: form.dealType,
    dealPrice: parseNumberInput(form.dealPrice),
    regularPrice: parseNumberInput(form.regularPrice),
    percentOff: parseNumberInput(form.percentOff),
    currency: form.currency.trim().toUpperCase(),
    daysOfWeek: form.daysOfWeek.length === 0 ? null : [...new Set(form.daysOfWeek)].sort((a, b) => a - b),
    timeStart: orNull(form.timeStart),
    timeEnd: orNull(form.timeEnd),
    validFrom: from,
    validUntil: until,
    channel: form.channel,
    flags: sortFlags(form.flags),
    promoCode: form.channel === "promo_code" ? orNull(form.promoCode) : null,
    address: orNull(form.address),
    lat: null,
    lon: null,
  };
}

// --- Validation ------------------------------------------------------------------------

type Issue = { code: string; path: PropertyKey[]; message: string; maximum?: unknown };

function issueMessage(field: string, issue: Issue): string {
  const { code, message } = issue;
  if (message === "At most 2 decimals") return "Folosește cel mult 2 zecimale.";
  if (message.includes("given together")) return "Completează și ora de început, și ora de final.";
  if (message.includes("must differ")) return "Ora de început și cea de final trebuie să fie diferite.";
  if (message.includes("validFrom must not be after")) return "Data de final nu poate fi înainte de cea de început.";
  switch (field) {
    case "restaurantName":
      return code === "too_big" ? "Numele restaurantului e prea lung (maxim 120 de caractere)." : "Completează numele restaurantului.";
    case "title":
      return code === "too_big" ? "Titlul e prea lung (maxim 140 de caractere)." : "Completează titlul ofertei.";
    case "description":
      return "Descrierea e prea lungă (maxim 1000 de caractere).";
    case "dealType":
      return "Alege tipul ofertei.";
    case "dealPrice":
      return code === "too_small" ? "Prețul nu poate fi negativ." : "Introdu un preț valid.";
    case "regularPrice":
      return code === "too_small" ? "Prețul normal trebuie să fie mai mare ca 0." : "Introdu un preț normal valid.";
    case "percentOff":
      return "Procentul trebuie să fie un număr întreg între 1 și 100.";
    case "currency":
      return "Moneda are 3 litere, de exemplu RON.";
    case "channel":
      return "Alege unde e valabilă oferta.";
    case "flags":
      return "Bifează doar condițiile din listă.";
    case "promoCode":
      return "Codul promoțional e prea lung (maxim 64 de caractere).";
    case "daysOfWeek":
      return "Alege cel puțin o zi sau lasă toate zilele nebifate.";
    case "timeStart":
    case "timeEnd":
      return "Ora trebuie să fie în formatul HH:MM.";
    case "validFrom":
    case "validUntil":
      return "Alege o dată validă.";
    case "address":
    case "lat":
    case "lon":
      return "Adresa e prea lungă (maxim 200 de caractere).";
    default:
      return "Valoare invalidă.";
  }
}

/** The form field a server `invalid_draft:<field>` points at (lat/lon belong to the address). */
export function serverFieldToFormField(field: string | null): FormField | null {
  if (field === null) return null;
  if (field === "lat" || field === "lon") return "address";
  return (FORM_FIELDS as readonly string[]).includes(field) ? (field as FormField) : null;
}

/** Message for a field the server rejected (`invalid_draft:<field>`) that the form check let through. */
export function serverDraftErrorMessage(field: FormField): string {
  if (field === "validUntil") return "Data de final a trecut deja sau e înainte de cea de început.";
  return "Valoarea nu e acceptată. Verific-o.";
}

export type ValidationResult = { ok: true; draft: DealDraft } | { ok: false; errors: FormErrors };

export function validateForm(form: FormState, now: Date = new Date()): ValidationResult {
  const parsed = dealDraftSchema.safeParse(draftFromForm(form));
  const errors: FormErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues as Issue[]) {
      const key = serverFieldToFormField(String(issue.path[0] ?? ""));
      if (key && !errors[key]) errors[key] = issueMessage(key, issue);
    }
  } else if (parsed.data.validUntil !== null && Date.parse(parsed.data.validUntil) <= now.getTime()) {
    errors.validUntil = "Data de final a trecut deja.";
  }
  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, draft: (parsed as { data: DealDraft }).data };
}

/** The two fields the form can't be published without. */
export function requiredFieldsFilled(form: FormState): boolean {
  return form.restaurantName.trim() !== "" && form.title.trim() !== "";
}

/** Live hint while typing: the deal price is not lower than the regular price. */
export function formNotADiscount(form: Pick<FormState, "dealPrice" | "regularPrice">): boolean {
  const deal = parseNumberInput(form.dealPrice);
  const regular = parseNumberInput(form.regularPrice);
  return isNotADiscount(Number.isNaN(deal) ? null : deal, Number.isNaN(regular) ? null : regular);
}

// --- Pre-fill without overwriting the user ------------------------------------------------

const isEmptyValue = (value: FormState[FormField]): boolean =>
  Array.isArray(value) ? value.length === 0 : typeof value === "string" ? value.trim() === "" : false;

/**
 * Applies an extraction on top of the current form. A field the user typed in (`touched`) and
 * still holds something keeps its value; every other field takes the extracted one, so a
 * second autofill from another source replaces the first one's suggestions but never the
 * user's own edits.
 */
export function mergeExtraction(current: FormState, extracted: FormState, touched: ReadonlySet<FormField>): FormState {
  const merged = { ...extracted } as Record<FormField, FormState[FormField]>;
  for (const field of FORM_FIELDS) {
    if (touched.has(field) && !isEmptyValue(current[field])) merged[field] = current[field];
  }
  return merged as FormState;
}
