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
  },
}));
