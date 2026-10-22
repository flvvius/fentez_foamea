import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders, setResponseStatus } from "@tanstack/react-start/server";
import { getSql } from "../db";
import { getCurrentUser } from "../session";
import { SubmitError } from "./errors";
import { NO_STORE, rethrowSubmitError } from "./http-errors";
import { parseSubmitDealInput } from "./inputs";
import { pgSubmitDeps } from "./store";
import { submitDealFlow } from "./submit-deal";
import type { SubmitDealResult } from "./types";

/**
 * Publishes a deal. A source (sourceUrl or imageId) is required. Resolves to
 * { status: "created", dealId } or { status: "duplicate", dealId, title }. Failures throw an
 * Error whose message is the code: unauthorized 401, invalid_input 400, source_required 400,
 * invalid_url 400, invalid_draft[:<field>] 400, image_not_found 404, rate_limited:<seconds> 429,
 * internal_error 500 (see errors.ts: submitErrorCode, submitRetryAfter, submitInvalidField).
 * `extraction` is client-supplied metadata: stored for our own analytics, never shown, never trusted.
 */
export const submitDeal = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    try {
      return parseSubmitDealInput(data);
    } catch (error) {
      setResponseStatus(400);
      throw error;
    }
  })
  .handler(async ({ data }): Promise<SubmitDealResult> => {
    setResponseHeaders(new Headers(NO_STORE));
    try {
      const user = await getCurrentUser();
      if (!user) throw SubmitError.of("unauthorized");
      return await submitDealFlow(pgSubmitDeps(getSql(), user.id), user.id, data);
    } catch (error) {
      return rethrowSubmitError(error);
    }
  });
