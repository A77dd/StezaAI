import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findForbiddenGrammyImports } from "./layering";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "telegram-layering-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function write(relativePath: string, source: string): Promise<string> {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, source);
  return filePath;
}

describe("findForbiddenGrammyImports", () => {
  it("passes when the directory does not exist", async () => {
    expect(
      await findForbiddenGrammyImports([path.join(root, "missing")]),
    ).toEqual([]);
  });

  it("passes for an empty directory", async () => {
    await mkdir(path.join(root, "domain"));

    expect(
      await findForbiddenGrammyImports([path.join(root, "domain")]),
    ).toEqual([]);
  });

  it("passes for files without grammY imports", async () => {
    await write("domain/a.ts", 'import { z } from "zod";\nexport const a = 1;\n');
    await write("domain/note.ts", '// we never import from "grammy" here\nexport const b = 2;\n');

    expect(
      await findForbiddenGrammyImports([path.join(root, "domain")]),
    ).toEqual([]);
  });

  it.each([
    ["static import", 'import { Bot } from "grammy";'],
    ["type import", 'import type { Context } from "grammy";'],
    ["subpath import", 'import { x } from "grammy/types";'],
    ["plugin import", "import { run } from '@grammyjs/runner';"],
    ["side-effect import", 'import "grammy";'],
    ["re-export", 'export { Bot } from "grammy";'],
    ["dynamic import", 'const m = await import("@grammyjs/hydrate");'],
    ["require", 'const g = require("grammy");'],
    ["multi-line import", 'import {\n  Bot,\n} from\n  "grammy";'],
  ])("detects a %s", async (_label, source) => {
    const file = await write("render/bad.ts", `${source}\n`);

    const violations = await findForbiddenGrammyImports([
      path.join(root, "render"),
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.file).toBe(file);
  });

  it("scans nested directories and .tsx files, ignoring other extensions", async () => {
    const nested = await write(
      "domain/deep/er/view.tsx",
      'import { Bot } from "grammy";\n',
    );
    await write("domain/readme.md", 'import { Bot } from "grammy";\n');
    await write("domain/ok.ts", 'import { Bot } from "grammyx";\n');

    const violations = await findForbiddenGrammyImports([
      path.join(root, "domain"),
    ]);

    expect(violations.map((violation) => violation.file)).toEqual([nested]);
  });

  it("does not flag look-alike package names", async () => {
    await write(
      "domain/ok.ts",
      'import a from "grammyish";\nimport b from "@grammy/other";\n',
    );

    expect(
      await findForbiddenGrammyImports([path.join(root, "domain")]),
    ).toEqual([]);
  });

  it("reports the module specifier that was imported", async () => {
    await write("domain/bad.ts", 'import { run } from "@grammyjs/runner";\n');

    const [violation] = await findForbiddenGrammyImports([
      path.join(root, "domain"),
    ]);

    expect(violation?.specifier).toBe("@grammyjs/runner");
  });
});
