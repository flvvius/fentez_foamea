function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function required(name: string): string {
  const value = optional(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  databaseUrl: () => required("DATABASE_URL"),
  geminiApiKey: () => optional("GEMINI_API_KEY"),
  geminiModel: () => optional("GEMINI_MODEL") ?? "gemini-2.5-flash-lite",
  geminiRequestsPerMinute: () => Number(optional("GEMINI_RPM") ?? 10),
  geminiDailyBudget: () => Number(optional("GEMINI_DAILY_BUDGET") ?? 200),
  contact: () => optional("SCRAPER_CONTACT") ?? "https://github.com/fentezfoamea",
};
