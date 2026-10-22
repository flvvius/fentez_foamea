import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { DEAL_CHANNELS, DEAL_CHANNEL_LABELS, DEAL_TYPES, DEAL_TYPE_LABELS, type ExtractionResult } from "@fentezfoamea/core";
import {
  draftFromForm,
  emptyForm,
  formFromDraft,
  formNotADiscount,
  mergeExtraction,
  requiredFieldsFilled,
  serverDraftErrorMessage,
  serverFieldToFormField,
  validateForm,
  type FormErrors,
  type FormField,
  type FormState,
} from "@/lib/deals/deal-form";
import type { AutofillSource } from "@/lib/deals/autofill-progress";
import { isOvernight } from "@/lib/deals/deal-display";
import { AutofillProgress } from "./AutofillProgress";
import { markPosted } from "@/lib/deals/posted-flag";
import {
  EXTRACTION_UNAVAILABLE,
  extractionNotes,
  needsScreenshotMessage,
  submitErrorMessage,
  submitErrorMessageFromCode,
  warningMessage,
} from "@/lib/deals/messages";
import { prepareScreenshot, uploadScreenshot } from "@/lib/deals/screenshot";
import { extractFromImage, extractFromUrl } from "@/server/submit/extract";
import { submitDeal } from "@/server/submit/submit";
import { submitErrorCode, submitInvalidField } from "@/server/submit/errors";
import type { NeedsScreenshotReason } from "@/server/submit/types";

const WEEKDAYS = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"] as const;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type Notice =
  /** `origin` picks where it shows: under the source (autofill) or next to the submit button. */
  | { kind: "duplicate"; dealId: string; title: string; origin: "extract" | "submit" }
  | { kind: "needs_screenshot"; reason: NeedsScreenshotReason }
  | { kind: "extracted"; snippet: string | null; notes: string[] }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

type ExtractionUsed = { source: "text" | "image"; evidenceSnippet: string | null; confidence: number };

function Field({
  name,
  label,
  error,
  hint,
  children,
  className,
}: Readonly<{ name: string; label: string; error?: string; hint?: string; children: ReactNode; className?: string }>) {
  return (
    <div className={`field ${className ?? ""}`}>
      <label htmlFor={`f-${name}`}>{label}</label>
      {children}
      {hint && (
        <p id={`f-${name}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`f-${name}-error`} className="field-error" role="alert">
          <span className="err-label">Eroare: </span>
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(name: string, error?: string, hint?: string): string | undefined {
  const ids = [hint ? `f-${name}-hint` : null, error ? `f-${name}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function DuplicateNotice({ dealId, title }: Readonly<{ dealId: string; title: string }>) {
  return (
    <p role="status" className="notice notice-warn">
      Oferta asta e deja postată:{" "}
      <Link to="/oferta/$id" params={{ id: dealId }} className="link-quiet">
        {title}
      </Link>
    </p>
  );
}

export function PostForm() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [uploaded, setUploaded] = useState<{ file: File; imageId: string } | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [duplicateFor, setDuplicateFor] = useState<string | null>(null);
  const [used, setUsed] = useState<ExtractionUsed | null>(null);
  const [working, setWorking] = useState<"extract" | "submit" | null>(null);
  const [extractSource, setExtractSource] = useState<AutofillSource>("link");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const detailsRef = useRef<HTMLHeadingElement>(null);
  // Fields the user edited by hand: an autofill never overwrites them.
  const touched = useRef(new Set<FormField>());

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    if (notice?.kind === "needs_screenshot") fileRef.current?.focus();
    // After a successful autofill, move to the fields it filled in.
    if (notice?.kind === "extracted") detailsRef.current?.focus();
  }, [notice]);

  const trimmedUrl = url.trim();
  const hasSource = trimmedUrl !== "" || file !== null;
  const isDuplicate = duplicateFor !== null && duplicateFor === trimmedUrl;
  const canSubmit = hasSource && requiredFieldsFilled(form) && !isDuplicate && working === null;
  const notADiscount = formNotADiscount(form);

  function setField<K extends FormField>(field: K, value: FormState[K]) {
    touched.current.add(field);
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function onUrlChange(next: string) {
    setUrl(next);
    // A different link means any earlier pre-fill no longer describes the source.
    setUsed(null);
  }

  function onFileChange(next: File | null) {
    setFileError(null);
    setUsed(null);
    if (next && !ACCEPTED_TYPES.includes(next.type)) {
      setFileError(submitErrorMessageFromCode("invalid_image"));
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(next);
    setUploaded(null);
  }

  async function ensureUploaded(): Promise<string> {
    if (!file) throw new Error("source_required");
    if (uploaded?.file === file) return uploaded.imageId;
    const blob = await prepareScreenshot(file);
    const result = await uploadScreenshot(blob);
    if (!result.ok) throw new Error(result.code);
    setUploaded({ file, imageId: result.imageId });
    return result.imageId;
  }

  function applyExtraction(extraction: ExtractionResult | null, status: "ok" | "unavailable" | "failed", source: "text" | "image") {
    if (status !== "ok" || !extraction) {
      setNotice({ kind: "unavailable" });
      setUsed(null);
      return;
    }
    setForm((current) => mergeExtraction(current, formFromDraft(extraction.draft), touched.current));
    setErrors({});
    setUsed({ source, evidenceSnippet: extraction.evidenceSnippet, confidence: extraction.confidence });
    setNotice({ kind: "extracted", snippet: extraction.evidenceSnippet, notes: extractionNotes(extraction) });
  }

  async function extractFromScreenshot() {
    const imageId = await ensureUploaded();
    const result = await extractFromImage({ data: { imageId, ...(caption.trim() ? { caption: caption.trim() } : {}) } });
    applyExtraction(result.extraction, result.extractionStatus, "image");
  }

  async function autofill() {
    if (!hasSource || working) return;
    setExtractSource(trimmedUrl ? "link" : "image");
    setWorking("extract");
    setNotice(null);
    setSubmitError(null);
    try {
      if (trimmedUrl) {
        const result = await extractFromUrl({ data: { url: trimmedUrl } });
        if (result.status === "duplicate") {
          setDuplicateFor(trimmedUrl);
          setNotice({ kind: "duplicate", dealId: result.dealId, title: result.title, origin: "extract" });
          return;
        }
        if (result.status === "needs_screenshot") {
          if (!file) {
            setNotice({ kind: "needs_screenshot", reason: result.reason });
            return;
          }
          // The link couldn't be read; the screenshot takes over, with its own steps.
          setExtractSource("image");
        } else {
          applyExtraction(result.extraction, result.extractionStatus, "text");
          return;
        }
      }
      await extractFromScreenshot();
    } catch (error) {
      setNotice({ kind: "error", message: submitErrorMessage(error) });
    } finally {
      setWorking(null);
    }
  }

  function focusField(field: FormField) {
    document.getElementById(`f-${field}`)?.focus();
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitError(null);
    const checked = validateForm(form);
    if (!checked.ok) {
      setErrors(checked.errors);
      const first = (Object.keys(checked.errors) as FormField[])[0];
      if (first) focusField(first);
      return;
    }
    setErrors({});
    setWorking("submit");
    try {
      const imageId = file ? await ensureUploaded() : null;
      const result = await submitDeal({
        data: {
          draft: checked.draft,
          ...(trimmedUrl ? { sourceUrl: trimmedUrl } : {}),
          ...(imageId ? { imageId } : {}),
          extraction: used
            ? { evidenceSnippet: used.evidenceSnippet ?? undefined, confidence: used.confidence, source: used.source }
            : { source: "manual" },
        },
      });
      if (result.status === "duplicate") {
        setDuplicateFor(trimmedUrl);
        setNotice({ kind: "duplicate", dealId: result.dealId, title: result.title, origin: "submit" });
        return;
      }
      // Lets the feed pin this deal (see posted-flag.ts).
      markPosted(result.dealId);
      // The feed is CDN-cached for up to a minute: hand the new id over so it is pinned on top.
      await navigate({ to: "/", search: { sort: "latest", posted: result.dealId } });
    } catch (error) {
      if (submitErrorCode(error) === "invalid_draft") {
        const field = serverFieldToFormField(submitInvalidField(error));
        if (field) {
          setErrors({ [field]: serverDraftErrorMessage(field) });
          focusField(field);
        }
      }
      setSubmitError(submitErrorMessage(error));
    } finally {
      setWorking(null);
    }
  }

  const draftPreview = draftFromForm(form);
  const overnight = isOvernight(draftPreview.timeStart ?? null, draftPreview.timeEnd ?? null);

  return (
    <div className="post">
      <section aria-labelledby="sursa" className="post-step">
        <h2 id="sursa" className="step-title">
          1. De unde e oferta
        </h2>
        <p className="lede">Ai nevoie de un link sau de o captură de ecran. Le poți adăuga pe amândouă.</p>

        <Field name="url" label="Link către ofertă" hint="De pe TikTok, site-ul restaurantului sau altă pagină publică. Pentru Instagram și Facebook adaugă și o captură.">
          <input
            id="f-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://"
            value={url}
            aria-describedby="f-url-hint"
            onChange={(e) => onUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void autofill();
              }
            }}
          />
        </Field>

        <Field name="file" label="Captură de ecran" error={fileError ?? undefined} hint="JPEG, PNG sau WebP. O micșorăm înainte să o trimitem.">
          <input
            id="f-file"
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-describedby={describedBy("file", fileError ?? undefined, "x")}
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />
        </Field>
        {preview && (
          <div className="shot">
            <img src={preview} alt="Captura aleasă" className="shot-img" />
            <button
              type="button"
              className="link-quiet"
              onClick={() => {
                onFileChange(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              Scoate captura
            </button>
          </div>
        )}

        <Field name="caption" label="Text din postare (opțional)" hint="Dacă postarea are un text, lipește-l aici; ne ajută să citim captura.">
          <textarea
            id="f-caption"
            rows={3}
            maxLength={2000}
            value={caption}
            aria-describedby="f-caption-hint"
            onChange={(e) => setCaption(e.target.value)}
          />
        </Field>

        <div className="actions">
          <button type="button" className="btn-secondary" onClick={() => void autofill()} disabled={!hasSource || working !== null}>
            {working === "extract" ? "Citim oferta…" : "Completează automat"}
          </button>
          <span className="muted small">Nimic nu se publică până nu apeși „Publică oferta”.</span>
        </div>

        {working === "extract" && <AutofillProgress key={extractSource} source={extractSource} />}
        <div aria-live="polite" aria-busy={working === "extract"} className="notices">
          {notice?.kind === "duplicate" && notice.origin === "extract" && <DuplicateNotice dealId={notice.dealId} title={notice.title} />}
          {notice?.kind === "needs_screenshot" && <p className="notice notice-warn">{needsScreenshotMessage(notice.reason)}</p>}
          {notice?.kind === "unavailable" && <p className="notice notice-warn">{EXTRACTION_UNAVAILABLE}</p>}
          {notice?.kind === "error" && (
            <p role="alert" className="notice notice-error">
              <span className="err-label">Eroare: </span>
              {notice.message}
            </p>
          )}
          {notice?.kind === "extracted" && (
            <div className="notice">
              <p>Am completat câmpurile de mai jos. Verifică-le și corectează ce nu e bine.</p>
              {notice.snippet && <p>Am luat prețul din: „{notice.snippet}”</p>}
              {notice.notes.length > 0 && (
                <ul className="notes">
                  {notice.notes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>

      <form onSubmit={onSubmit} noValidate aria-labelledby="detalii" className="post-step">
        <h2 id="detalii" ref={detailsRef} tabIndex={-1} className="step-title">
          2. Detaliile ofertei
        </h2>

        <Field name="restaurantName" label="Restaurant *" error={errors.restaurantName}>
          <input
            id="f-restaurantName"
            value={form.restaurantName}
            maxLength={120}
            required
            aria-invalid={!!errors.restaurantName}
            aria-describedby={describedBy("restaurantName", errors.restaurantName)}
            onChange={(e) => setField("restaurantName", e.target.value)}
          />
        </Field>
        <Field name="title" label="Titlul ofertei *" error={errors.title}>
          <input
            id="f-title"
            value={form.title}
            maxLength={140}
            required
            aria-invalid={!!errors.title}
            aria-describedby={describedBy("title", errors.title)}
            onChange={(e) => setField("title", e.target.value)}
          />
        </Field>
        <Field name="description" label="Descriere" error={errors.description}>
          <textarea
            id="f-description"
            rows={3}
            maxLength={1000}
            value={form.description}
            aria-invalid={!!errors.description}
            aria-describedby={describedBy("description", errors.description)}
            onChange={(e) => setField("description", e.target.value)}
          />
        </Field>

        <div className="field-row">
          <Field name="dealType" label="Tipul ofertei" error={errors.dealType}>
            <select id="f-dealType" value={form.dealType} onChange={(e) => setField("dealType", e.target.value as FormState["dealType"])}>
              {DEAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {DEAL_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>
          <Field name="channel" label="Unde e valabilă" error={errors.channel}>
            <select id="f-channel" value={form.channel} onChange={(e) => setField("channel", e.target.value as FormState["channel"])}>
              {DEAL_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {DEAL_CHANNEL_LABELS[channel]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {form.channel === "promo_code" && (
          <Field name="promoCode" label="Cod promoțional" error={errors.promoCode}>
            <input
              id="f-promoCode"
              value={form.promoCode}
              maxLength={64}
              className="mono"
              autoCapitalize="characters"
              aria-invalid={!!errors.promoCode}
              aria-describedby={describedBy("promoCode", errors.promoCode)}
              onChange={(e) => setField("promoCode", e.target.value)}
            />
          </Field>
        )}

        <div className="field-row">
          <Field name="dealPrice" label="Preț ofertă" error={errors.dealPrice}>
            <input
              id="f-dealPrice"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={form.dealPrice}
              aria-invalid={!!errors.dealPrice}
              aria-describedby={describedBy("dealPrice", errors.dealPrice)}
              onChange={(e) => setField("dealPrice", e.target.value)}
            />
          </Field>
          <Field name="regularPrice" label="Preț normal" error={errors.regularPrice}>
            <input
              id="f-regularPrice"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={form.regularPrice}
              aria-invalid={!!errors.regularPrice}
              aria-describedby={describedBy("regularPrice", errors.regularPrice)}
              onChange={(e) => setField("regularPrice", e.target.value)}
            />
          </Field>
          <Field name="percentOff" label="Reducere (%)" error={errors.percentOff}>
            <input
              id="f-percentOff"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={form.percentOff}
              aria-invalid={!!errors.percentOff}
              aria-describedby={describedBy("percentOff", errors.percentOff)}
              onChange={(e) => setField("percentOff", e.target.value)}
            />
          </Field>
          <Field name="currency" label="Moneda" error={errors.currency}>
            <input
              id="f-currency"
              value={form.currency}
              maxLength={3}
              autoCapitalize="characters"
              aria-invalid={!!errors.currency}
              aria-describedby={describedBy("currency", errors.currency)}
              onChange={(e) => setField("currency", e.target.value.toUpperCase())}
            />
          </Field>
        </div>
        {notADiscount && <p className="field-hint">{warningMessage("not_a_discount")}</p>}

        <fieldset className="field days" aria-describedby={errors.daysOfWeek ? "f-daysOfWeek-error" : undefined}>
          <legend>Zilele în care e valabilă</legend>
          <p className="field-hint">Nu bifa nimic dacă e valabilă în fiecare zi.</p>
          <div className="day-row">
            {WEEKDAYS.map((name, index) => {
              const day = index + 1;
              return (
                <label key={day} className="day">
                  <input
                    type="checkbox"
                    checked={form.daysOfWeek.includes(day)}
                    id={day === 1 ? "f-daysOfWeek" : undefined}
                    onChange={(e) =>
                      setField(
                        "daysOfWeek",
                        e.target.checked ? [...form.daysOfWeek, day].sort((a, b) => a - b) : form.daysOfWeek.filter((d) => d !== day),
                      )
                    }
                  />
                  <span>{name}</span>
                </label>
              );
            })}
          </div>
          {errors.daysOfWeek && (
            <p id="f-daysOfWeek-error" className="field-error" role="alert">
              <span className="err-label">Eroare: </span>
              {errors.daysOfWeek}
            </p>
          )}
        </fieldset>

        <div className="field-row">
          <Field name="timeStart" label="De la ora" error={errors.timeStart}>
            <input
              id="f-timeStart"
              type="time"
              value={form.timeStart}
              aria-invalid={!!errors.timeStart}
              aria-describedby={describedBy("timeStart", errors.timeStart)}
              onChange={(e) => setField("timeStart", e.target.value)}
            />
          </Field>
          <Field name="timeEnd" label="Până la ora" error={errors.timeEnd} hint={overnight ? "Intervalul trece de miezul nopții." : undefined}>
            <input
              id="f-timeEnd"
              type="time"
              value={form.timeEnd}
              aria-invalid={!!errors.timeEnd}
              aria-describedby={describedBy("timeEnd", errors.timeEnd, overnight ? "x" : undefined)}
              onChange={(e) => setField("timeEnd", e.target.value)}
            />
          </Field>
        </div>

        <div className="field-row">
          <Field name="validFrom" label="Valabilă de la" error={errors.validFrom}>
            <input
              id="f-validFrom"
              type="date"
              value={form.validFrom}
              aria-invalid={!!errors.validFrom}
              aria-describedby={describedBy("validFrom", errors.validFrom)}
              onChange={(e) => setField("validFrom", e.target.value)}
            />
          </Field>
          <Field
            name="validUntil"
            label="Valabilă până la"
            error={errors.validUntil}
            hint="Dacă o lași goală, o păstrăm 7 zile. Ora e cea din România."
          >
            <input
              id="f-validUntil"
              type="date"
              value={form.validUntil}
              aria-invalid={!!errors.validUntil}
              aria-describedby={describedBy("validUntil", errors.validUntil, "x")}
              onChange={(e) => setField("validUntil", e.target.value)}
            />
          </Field>
        </div>

        <Field name="address" label="Adresa" error={errors.address}>
          <input
            id="f-address"
            value={form.address}
            maxLength={200}
            autoComplete="off"
            aria-invalid={!!errors.address}
            aria-describedby={describedBy("address", errors.address)}
            onChange={(e) => setField("address", e.target.value)}
          />
        </Field>

        <div aria-live="polite">
          {notice?.kind === "duplicate" && notice.origin === "submit" && isDuplicate && <DuplicateNotice dealId={notice.dealId} title={notice.title} />}
          {submitError && (
            <p role="alert" className="notice notice-error">
              <span className="err-label">Eroare: </span>
              {submitError}
            </p>
          )}
        </div>

        <div className="actions">
          <button type="submit" className="btn-primary" disabled={!canSubmit}>
            {working === "submit" ? "Se publică…" : "Publică oferta"}
          </button>
          {!hasSource && <span className="muted small">Adaugă mai întâi un link sau o captură de ecran.</span>}
          {hasSource && !requiredFieldsFilled(form) && <span className="muted small">Completează restaurantul și titlul.</span>}
        </div>
      </form>
    </div>
  );
}
