import path from "node:path";
import { describe, expect, it } from "vitest";
import { findForbiddenGrammyImports, findImports } from "../testing/layering";

// Layering of the Telegram feature (ADR 0002):
//
//   domain, callbacks, render, adapters   framework-free, know nothing of bot/ or handlers/
//   bot/                                  grammY wiring; must not know handlers/
//   handlers/                             grammY handlers; use bot/ through its public index
//   (root) createTelegramBot.ts           the one place that joins bot/ and handlers/
//
// domain/, render/ and callbacks/ are also enforced by ESLint; bot/ -> handlers
// is too. This test covers what ESLint cannot express as easily and fails with
// the offending file.

const telegramRoot = path.resolve(import.meta.dirname, "..");
const inTelegram = (...names: string[]): string[] => names.map((name) => path.join(telegramRoot, name));

const frameworkFree = inTelegram("adapters", "callbacks", "domain", "render");

/** Matches a relative import that reaches into `folder` (`../handlers`, `../../bot/x`). */
function reaches(folder: string): (specifier: string) => boolean {
  const pattern = new RegExp(`^\\.{1,2}/(?:.*/)?${folder}(?:/|$)`);
  return (specifier) => pattern.test(specifier);
}

describe("telegram architecture", () => {
  it("keeps bot/ independent of handlers/ (handlers depend on the bot layer, not the reverse)", async () => {
    expect(await findImports(inTelegram("bot"), reaches("handlers"))).toEqual([]);
  });

  it("keeps grammY out of adapters/, callbacks/, domain/ and render/", async () => {
    expect(await findForbiddenGrammyImports(frameworkFree)).toEqual([]);
  });

  it("keeps the framework-free layers independent of bot/ and handlers/", async () => {
    expect(await findImports(frameworkFree, reaches("bot"))).toEqual([]);
    expect(await findImports(frameworkFree, reaches("handlers"))).toEqual([]);
  });

  it("lets handlers/ use the bot layer only through its public index", async () => {
    const deepImports = await findImports(inTelegram("handlers"), (specifier) =>
      /^\.{1,2}\/(?:.*\/)?bot\/./.test(specifier),
    );

    expect(deepImports).toEqual([]);
  });

  it("scans real imports (handlers/ does import the bot layer, so the scanner finds it)", async () => {
    const imports = await findImports(inTelegram("handlers"), reaches("bot"));

    expect(imports.length).toBeGreaterThan(0);
  });
});
