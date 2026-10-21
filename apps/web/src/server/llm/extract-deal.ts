import { BUCHAREST_TZ, bucharestToday, validateExtraction, type ExtractionResult } from "@fentezfoamea/core";
import { prepareContentText } from "./prepare.ts";
import { ExtractionProviderError, type ExtractionInput, type ExtractionProvider } from "./provider.ts";

export type ExtractDealOutcome =
  | { status: "ok"; result: ExtractionResult; model: string }
  | { status: "unavailable" }
  | { status: "failed"; reason: "provider_error" | "timeout" };

function weekdayName(now: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: BUCHAREST_TZ, weekday: "long" }).format(now);
}

/**
 * Pre-fills a deal draft from source content. The model only suggests; `validateExtraction`
 * decides what is trusted, and the user reviews the result before anything is published.
 * Provider failures come back as a status, never as an exception.
 */
export async function extractDeal(
  input: ExtractionInput,
  deps: { provider: ExtractionProvider | null; now?: () => Date },
): Promise<ExtractDealOutcome> {
  const { provider } = deps;
  if (!provider) return { status: "unavailable" };

  const clock = (deps.now ?? (() => new Date()))();
  const now = Number.isNaN(clock.getTime()) ? new Date() : clock;
  // The provider gets the prepared text, so the evidence check below runs against exactly what the model saw.
  const seen: ExtractionInput = input.kind === "text" ? { ...input, text: prepareContentText(input.text) } : input;
  let raw: unknown;
  try {
    raw = await provider.extract(seen, { today: bucharestToday(now), weekday: weekdayName(now) });
  } catch (error) {
    const timedOut = error instanceof ExtractionProviderError && error.kind === "timeout";
    // Only the error kind and the model go to the log: messages can echo the request.
    console.warn("[deals-llm] extraction failed", {
      model: provider.model,
      input: input.kind,
      kind: error instanceof ExtractionProviderError ? error.kind : "unexpected",
    });
    return { status: "failed", reason: timedOut ? "timeout" : "provider_error" };
  }

  const result =
    seen.kind === "text"
      ? validateExtraction(raw, { source: "text", sourceText: seen.text, now })
      : validateExtraction(raw, { source: "image", sourceText: seen.caption ?? undefined, now });
  return { status: "ok", result, model: provider.model };
}
