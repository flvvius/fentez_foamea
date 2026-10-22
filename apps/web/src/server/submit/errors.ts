// Client-safe: no server imports. Only an Error's message survives the server fn boundary,
// so the message is the code. "rate_limited:<seconds>" carries the retry delay and
// "invalid_draft:<field>" the first field that failed validation.
export const SUBMIT_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "invalid_input",
  "invalid_url",
  "url_not_allowed",
  "source_required",
  "source_blocked",
  "invalid_draft",
  "image_not_found",
  "image_too_large",
  "invalid_image",
  "rate_limited",
  "budget_exhausted",
  "internal_error",
] as const;

export type SubmitErrorCode = (typeof SUBMIT_ERROR_CODES)[number];

export const SUBMIT_ERROR_STATUS: Record<SubmitErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  invalid_input: 400,
  invalid_url: 400,
  url_not_allowed: 400,
  source_required: 400,
  source_blocked: 409,
  invalid_draft: 400,
  image_not_found: 404,
  image_too_large: 413,
  invalid_image: 415,
  rate_limited: 429,
  budget_exhausted: 429,
  internal_error: 500,
};

export class SubmitError extends Error {
  readonly code: SubmitErrorCode;
  readonly status: number;
  /** Seconds, for rate_limited and budget_exhausted. */
  readonly retryAfterSeconds: number | null;
  /** The field path, for invalid_draft. */
  readonly field: string | null;

  private constructor(code: SubmitErrorCode, detail: { retryAfterSeconds?: number; field?: string }) {
    super(
      code === "rate_limited" && detail.retryAfterSeconds !== undefined
        ? `${code}:${detail.retryAfterSeconds}`
        : code === "invalid_draft" && detail.field
          ? `${code}:${detail.field}`
          : code,
    );
    this.name = "SubmitError";
    this.code = code;
    this.status = SUBMIT_ERROR_STATUS[code];
    this.retryAfterSeconds = detail.retryAfterSeconds ?? null;
    this.field = detail.field ?? null;
  }

  static of(code: Exclude<SubmitErrorCode, "rate_limited" | "budget_exhausted" | "invalid_draft">): SubmitError {
    return new SubmitError(code, {});
  }
  static rateLimited(retryAfterSeconds: number): SubmitError {
    return new SubmitError("rate_limited", { retryAfterSeconds });
  }
  /** The global daily extraction budget is spent. Not the user's fault, so no countdown in the message. */
  static budgetExhausted(retryAfterSeconds: number): SubmitError {
    return new SubmitError("budget_exhausted", { retryAfterSeconds });
  }
  static invalidDraft(field?: string): SubmitError {
    return new SubmitError("invalid_draft", { field });
  }
}

function parse(error: unknown): { code: SubmitErrorCode; detail: string | null } | null {
  if (!(error instanceof Error)) return null;
  const [code, detail, ...rest] = error.message.split(":");
  if (rest.length > 0 || !(SUBMIT_ERROR_CODES as readonly string[]).includes(code!)) return null;
  return { code: code as SubmitErrorCode, detail: detail ?? null };
}

/** For the UI: the code of an error caught from a submit server fn, or null if it isn't one of ours. */
export function submitErrorCode(error: unknown): SubmitErrorCode | null {
  return parse(error)?.code ?? null;
}

/** Seconds to wait before retrying, for a "rate_limited" error; null otherwise. */
export function submitRetryAfter(error: unknown): number | null {
  const parsed = parse(error);
  if (parsed?.code !== "rate_limited" || parsed.detail === null || !/^\d+$/.test(parsed.detail)) return null;
  return Number(parsed.detail);
}

/** The failing draft field of an "invalid_draft:<field>" error (e.g. "title"); null otherwise. */
export function submitInvalidField(error: unknown): string | null {
  const parsed = parse(error);
  return parsed?.code === "invalid_draft" ? parsed.detail : null;
}
