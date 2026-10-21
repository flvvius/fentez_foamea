export type ExtractionInput =
  | { kind: "text"; text: string; sourceUrl: string | null; postedAt: string | null }
  | {
      kind: "image";
      mimeType: "image/jpeg" | "image/png" | "image/webp";
      data: Uint8Array;
      caption: string | null;
      postedAt: string | null;
    };

export type PromptContext = {
  /** YYYY-MM-DD in Europe/Bucharest. */
  today: string;
  /** English weekday name of `today`, for resolving "vineri" or "this weekend". */
  weekday: string;
};

export interface ExtractionProvider {
  readonly model: string;
  /** Resolves to the model's raw parsed JSON. It is untrusted: run it through `validateExtraction`. */
  extract(input: ExtractionInput, context: PromptContext): Promise<unknown>;
}

export type ExtractionProviderErrorKind = "timeout" | "request_failed" | "invalid_response";

export class ExtractionProviderError extends Error {
  constructor(
    readonly kind: ExtractionProviderErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ExtractionProviderError";
  }
}
