import { setResponseStatus } from "@tanstack/react-start/server";
import { VoteError } from "./vote-errors";

/** Unexpected failure: log it, but don't leak driver messages to the client. */
export function failInternally(error: unknown): never {
  console.error(error);
  setResponseStatus(500);
  throw new VoteError("internal_error");
}
