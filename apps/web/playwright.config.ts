import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_URL } from "./e2e/database";

const PORT = 3101;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ro-RO",
    timezoneId: "Europe/Bucharest",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node .output/server/index.mjs",
    url: `http://localhost:${PORT}/favicon.svg`,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(PORT),
      DATABASE_URL: E2E_DATABASE_URL,
      // Test-only values so sign-in and the session endpoint work like in production.
      BETTER_AUTH_SECRET: "e2e-only-secret-that-is-never-used-anywhere-else",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
    },
  },
});
