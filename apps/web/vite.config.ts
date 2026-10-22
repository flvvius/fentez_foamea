import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), tanstackStart(), nitro(), viteReact()],
  // Bundling every dependency is for the deployed server. In dev it makes
  // Vite run React's CommonJS entry as ESM, which fails with
  // "module is not defined".
  ssr: {
    noExternal: command === "build" ? true : undefined,
    // A native module: it has to stay a runtime require, never bundled.
    external: ["@resvg/resvg-js"],
  },
  // The dev dependency scanner crawls server fn files before they become client stubs, so it
  // finds server-only packages and fails pre-bundling linkedom for the browser. The client never
  // imports these.
  optimizeDeps: {
    exclude: [
      "linkedom",
      "htmlparser2",
      "@mozilla/readability",
      "undici",
      "ipaddr.js",
      "pg",
      "postgres",
      "@google/genai",
      "@resvg/resvg-js",
      "satori",
    ],
  },
}));
