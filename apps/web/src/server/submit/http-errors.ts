import { setResponseHeaders, setResponseStatus } from "@tanstack/react-start/server";
import { SubmitError } from "./errors";

export const NO_STORE = { "cache-control": "no-store" };

/** Expected failures keep their code (the message) and status; anything else is logged and becomes internal_error. */
export function rethrowSubmitError(error: unknown): never {
  if (error instanceof SubmitError) {
    setResponseStatus(error.status);
    if (error.retryAfterSeconds !== null) {
      setResponseHeaders(new Headers({ ...NO_STORE, "retry-after": String(error.retryAfterSeconds) }));
    }
    throw error;
  }
  // The driver's message stays in the log: it can carry SQL, hosts or the request's content.
  console.error(error);
  setResponseStatus(500);
  throw SubmitError.of("internal_error");
}
