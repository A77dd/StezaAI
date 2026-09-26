import { describe, expect, it } from "vitest";
import { LOCALES } from "../../domain";
import { RenderError } from "../errors";
import { placeholders } from "./template";
import { getCatalog } from "./index";
import { en } from "./en";
import { ru } from "./ru";

type Leaf = { readonly path: string; readonly value: string | ((...args: never[]) => string) };

/** Every string and function of a catalog, with its dotted path (arrays by index). */
function leaves(node: unknown, path = ""): Leaf[] {
  if (typeof node === "string" || typeof node === "function") {
    return [{ path, value: node as Leaf["value"] }];
  }
  if (typeof node !== "object" || node === null) throw new Error(`Unexpected catalog value at ${path}`);
  return Object.entries(node).flatMap(([key, child]) => leaves(child, path === "" ? key : `${path}.${key}`));
}

const shape = (leaf: Leaf) =>
  typeof leaf.value === "string" ? `${leaf.path}: string` : `${leaf.path}: fn/${leaf.value.length}`;

// One argument list per catalog function: strings are markers that must survive
// into the output, numbers are printed.
const PROBES: Readonly<Record<string, readonly (string | number)[]>> = {
  "time.date": [7, "⟦month⟧", 2027],
  "time.onDate": ["⟦weekday⟧", "⟦date⟧"],
  "units.days": [7],
  "units.blocks": [7],
  "inline.andMore": [7],
  "group.add": ["⟦day⟧", "⟦time⟧"],
};

describe("message catalogs", () => {
  const ruLeaves = leaves(ru);
  const enLeaves = leaves(en);

  it("have identical keys, kinds and function arities", () => {
    expect(enLeaves.map(shape)).toEqual(ruLeaves.map(shape));
  });

  it("have no empty strings", () => {
    for (const { path, value } of [...ruLeaves, ...enLeaves]) {
      if (typeof value === "string") expect(value.trim(), path).not.toBe("");
    }
  });

  it("use the same placeholders in every locale", () => {
    for (const [index, { path, value }] of ruLeaves.entries()) {
      const other = enLeaves[index].value;
      if (typeof value === "string" && typeof other === "string") {
        expect(placeholders(other).sort(), path).toEqual(placeholders(value).sort());
      }
    }
  });

  it("have no stray braces outside placeholders", () => {
    for (const { path, value } of [...ruLeaves, ...enLeaves]) {
      if (typeof value === "string") {
        expect(value.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, ""), path).not.toMatch(/[{}]/);
      }
    }
  });

  it("have a probe for every function, and every function prints all its arguments", () => {
    const functionPaths = ruLeaves.filter(({ value }) => typeof value === "function").map(({ path }) => path);
    expect(Object.keys(PROBES).sort()).toEqual(functionPaths.sort());

    for (const catalog of [ru, en]) {
      for (const { path } of leaves(catalog).filter(({ value }) => typeof value === "function")) {
        const fn = path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], catalog);
        const args = PROBES[path];
        const output = (fn as (...values: unknown[]) => string)(...args);
        expect(output.trim(), path).not.toBe("");
        for (const arg of args) expect(output, `${path} drops ${String(arg)}`).toContain(String(arg));
      }
    }
  });

  it("share the fixed structure of calendar vocabulary", () => {
    for (const catalog of [ru, en]) {
      expect(catalog.time.weekdaysShort).toHaveLength(7);
      expect(catalog.time.monthsShort).toHaveLength(12);
    }
  });
});

describe("getCatalog", () => {
  it("returns the catalog of each supported locale", () => {
    expect(getCatalog("ru")).toBe(ru);
    expect(getCatalog("en")).toBe(en);
    expect(LOCALES).toEqual(["ru", "en"]);
  });

  it("rejects a locale it does not know instead of falling back", () => {
    expect(() => getCatalog("de" as never)).toThrow(RenderError);
  });
});
