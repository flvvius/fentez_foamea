import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-live",
  retries: 2,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.LIVE_URL ?? "https://fentez-foamea.vercel.app",
    locale: "ro-RO",
    timezoneId: "Europe/Bucharest",
    ...devices["Pixel 7"],
  },
});
