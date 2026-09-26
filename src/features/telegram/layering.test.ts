import path from "node:path";
import { describe, expect, it } from "vitest";
import { findForbiddenGrammyImports } from "./testing/layering";

const telegramRoot = import.meta.dirname;
const guardedDirectories = ["callbacks", "domain", "render"].map((name) =>
  path.join(telegramRoot, name),
);

describe("telegram layering (ADR 0002)", () => {
  it("keeps grammY out of callbacks/, domain/ and render/", async () => {
    const violations = await findForbiddenGrammyImports(guardedDirectories);

    expect(violations).toEqual([]);
  });
});
