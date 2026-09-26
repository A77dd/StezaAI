import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Two projects share this config (`extends: true`): browser-facing code runs
// in jsdom with the DOM setup file, while `src/features/telegram/**` is
// server-side code and runs in plain Node. Keep new Telegram tests under that
// folder and they pick up the Node environment without per-file docblocks.
// Only `*.test.ts` runs there: Mini App UI (.tsx) tests must live outside
// src/features/telegram to keep the Mini App isolated (ADR 0002).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["**/node_modules/**", "src/features/telegram/**"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "telegram",
          environment: "node",
          include: ["src/features/telegram/**/*.test.ts"],
        },
      },
    ],
  },
});
