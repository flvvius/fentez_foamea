// Client-safe: no server imports. Only an Error's message survives the server fn boundary,
// so the message is the code ("rate_limited:<seconds>" carries the retry delay).
export const VOTE_ERROR_CODES = [
  "unauthorized",
  "invalid_input",
  "deal_not_found",
  "deal_not_votable",
  "rate_limited",
  "internal_error",
] as const;

export type VoteErrorCode = (typeof VOTE_ERROR_CODES)[number];

export const VOTE_ERROR_STATUS: Record<VoteErrorCode, number> = {
  unauthorized: 401,
  invalid_input: 400,
  deal_not_found: 404,
  deal_not_votable: 409,
  rate_limited: 429,
  internal_error: 500,
};

export class VoteError extends Error {
  readonly code: VoteErrorCode;
  readonly status: number;
  readonly retryAfterSeconds: number | null;
  constructor(code: VoteErrorCode, retryAfterSeconds?: number) {
    super(retryAfterSeconds === undefined ? code : `${code}:${retryAfterSeconds}`);
    this.name = "VoteError";
    this.code = code;
    this.status = VOTE_ERROR_STATUS[code];
    this.retryAfterSeconds = retryAfterSeconds ?? null;
  }
}

function parse(error: unknown): { code: VoteErrorCode; retryAfterSeconds: number | null } | null {
  if (!(error instanceof Error)) return null;
  const [code, seconds, ...rest] = error.message.split(":");
  if (rest.length > 0 || !(VOTE_ERROR_CODES as readonly string[]).includes(code!)) return null;
  if (seconds !== undefined && !/^\d+$/.test(seconds)) return null;
  return { code: code as VoteErrorCode, retryAfterSeconds: seconds === undefined ? null : Number(seconds) };
}

/** For the UI: the code of an error caught from castVote, or null if it isn't one of ours. */
export function voteErrorCode(error: unknown): VoteErrorCode | null {
  return parse(error)?.code ?? null;
}

/** Seconds to wait before retrying, for a "rate_limited" error; null otherwise. */
export function voteRetryAfter(error: unknown): number | null {
  return parse(error)?.retryAfterSeconds ?? null;
}
