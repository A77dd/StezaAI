import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    // ADR 0002: domain, rendering and callback code stays independent of the
    // Bot API framework so it can be tested and reused without grammY.
    // Keep the module list in sync with isGrammyModule() in
    // src/features/telegram/testing/layering.ts.
    files: [
      "src/features/telegram/callbacks/**/*.{ts,tsx}",
      "src/features/telegram/domain/**/*.{ts,tsx}",
      "src/features/telegram/render/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["grammy", "grammy/*", "@grammyjs/*"],
              message:
                "domain/, render/ and callbacks/ must not import grammY or @grammyjs/* packages (ADR 0002). Keep Bot API types in bot/ and handlers/.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "**/.next/**",
    ".worktrees/**",
    "coverage/**",
    "out/**",
  ]),
]);
