import { createHash } from "node:crypto";
import { GoogleGenAI, Type, type ContentListUnion, type GenerateContentParameters, type Schema } from "@google/genai";
import { z } from "zod";
import { OFFER_KINDS, bucharestToday } from "@fentezfoamea/core";
import type { Sql } from "./db.ts";
import { env } from "./env.ts";
import type { Logger } from "./log.ts";
import { Throttle } from "./throttle.ts";

export const extractedOfferSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullish(),
  kind: z.enum(OFFER_KINDS),
  priceRon: z.number().nonnegative().nullish(),
  originalPriceRon: z.number().nonnegative().nullish(),
  validDate: z.string().nullish(),
  startTime: z.string().nullish(),
  endTime: z.string().nullish(),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).nullish(),
});

export type ExtractedOffer = z.infer<typeof extractedOfferSchema>;

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    offers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Short name of the deal or dish, in the page's language" },
          description: { type: Type.STRING, nullable: true, description: "What is included, max 200 characters" },
          kind: { type: Type.STRING, format: "enum", enum: [...OFFER_KINDS] },
          priceRon: { type: Type.NUMBER, nullable: true },
          originalPriceRon: { type: Type.NUMBER, nullable: true },
          validDate: { type: Type.STRING, nullable: true, description: "YYYY-MM-DD if the offer is for one specific date" },
          startTime: { type: Type.STRING, nullable: true, description: "HH:MM local time the offer starts each day" },
          endTime: { type: Type.STRING, nullable: true, description: "HH:MM local time the offer ends each day" },
          daysOfWeek: {
            type: Type.ARRAY,
            nullable: true,
            items: { type: Type.INTEGER },
            description: "ISO weekdays 1=Monday..7=Sunday when the offer applies",
          },
        },
        required: ["title", "kind"],
      },
    },
  },
  required: ["offers"],
};

const INSTRUCTIONS = `You extract food deals from restaurant web pages in Bucharest, Romania.
Return only offers a customer can actually use: daily menus (meniul zilei / meniu prânz), happy hours, 1+1 or combo deals, discounts with a lower price, coupons, end-of-day surplus boxes.
Do not return the regular à la carte menu, gift cards, catering, events, or job ads.
Prices are in RON (lei). Use null when a field is not stated; never guess prices or dates.
Kinds: daily_menu, happy_hour, combo, discount, coupon, surplus.`;

export type GenerateContent = (params: GenerateContentParameters) => Promise<{ text?: string }>;

export type PdfContext = { venueName: string; url: string; hint?: string };

export class GeminiExtractor {
  private readonly generate: GenerateContent;
  private readonly throttle: Throttle;
  private usedToday = 0;

  constructor(
    apiKey: string,
    private readonly sql: Sql | null,
    private readonly log: Logger,
    private readonly model = env.geminiModel(),
    generate?: GenerateContent,
  ) {
    if (generate) {
      this.generate = generate;
    } else {
      const client = new GoogleGenAI({ apiKey });
      this.generate = (params) => client.models.generateContent(params);
    }
    this.throttle = new Throttle(Math.ceil(60_000 / Math.max(1, env.geminiRequestsPerMinute())));
  }

  static fromEnv(sql: Sql | null, log: Logger): GeminiExtractor | null {
    const key = env.geminiApiKey();
    return key ? new GeminiExtractor(key, sql, log) : null;
  }

  async extractOffers(pageText: string, context: { venueName: string; url: string }): Promise<ExtractedOffer[]> {
    const trimmed = pageText.slice(0, 12_000);
    const hash = createHash("sha256").update(`${this.model}\n${context.venueName}\n${trimmed}`).digest("hex");
    return this.generateOffers(hash, `${preamble(context)}\n\n---\n${trimmed}`, context.url);
  }

  async extractOffersFromPdf(pdf: Uint8Array, context: PdfContext): Promise<ExtractedOffer[]> {
    const hash = createHash("sha256")
      .update(`${this.model}\n${context.venueName}\n${context.hint ?? ""}\n`)
      .update(pdf)
      .digest("hex");
    const prompt = context.hint ? `${preamble(context)}\n${context.hint}` : preamble(context);
    const contents: ContentListUnion = [
      {
        role: "user",
        parts: [{ text: prompt }, { inlineData: { mimeType: "application/pdf", data: Buffer.from(pdf).toString("base64") } }],
      },
    ];
    return this.generateOffers(hash, contents, context.url);
  }

  private async generateOffers(hash: string, contents: ContentListUnion, url: string): Promise<ExtractedOffer[]> {
    const cached = await this.cached(hash);
    if (cached) return cached;

    if (!(await this.withinBudget())) {
      this.log.warn("gemini daily budget reached, skipping", { url });
      return [];
    }

    await this.throttle.wait();
    const response = await this.generate({
      model: this.model,
      contents,
      config: {
        systemInstruction: INSTRUCTIONS,
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0,
      },
    });
    this.usedToday++;

    const parsed = z.object({ offers: z.array(z.unknown()) }).safeParse(JSON.parse(response.text ?? "{}"));
    const offers = (parsed.success ? parsed.data.offers : [])
      .map((item) => extractedOfferSchema.safeParse(item))
      .flatMap((result) => (result.success ? [result.data] : []));

    await this.store(hash, offers);
    return offers;
  }

  private async cached(hash: string): Promise<ExtractedOffer[] | undefined> {
    if (!this.sql) return undefined;
    const [row] = await this.sql<{ result: ExtractedOffer[] }[]>`
      select result from llm_cache where content_hash = ${hash}
    `;
    return row?.result;
  }

  private async store(hash: string, offers: ExtractedOffer[]): Promise<void> {
    if (!this.sql) return;
    await this.sql`
      insert into llm_cache (content_hash, model, result)
      values (${hash}, ${this.model}, ${this.sql.json(offers)})
      on conflict (content_hash) do nothing
    `;
  }

  private async withinBudget(): Promise<boolean> {
    const budget = env.geminiDailyBudget();
    if (!this.sql) return this.usedToday < budget;
    const [row] = await this.sql<{ count: number }[]>`
      select count(*)::int as count from llm_cache where created_at > now() - interval '24 hours'
    `;
    return (row?.count ?? 0) < budget;
  }
}

function preamble(context: { venueName: string; url: string }): string {
  return `Today is ${bucharestToday()}. Venue: ${context.venueName}. Page: ${context.url}`;
}
