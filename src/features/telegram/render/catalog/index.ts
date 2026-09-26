import type { Locale } from "../../domain";
import { RenderError } from "../errors";
import { en } from "./en";
import { ru } from "./ru";
import type { Catalog } from "./types";

export type { Catalog } from "./types";
export { HELP_COMMANDS } from "./commands";
export type { HelpCommand } from "./commands";
export { pluralEn, pluralRu } from "./plural";
export { fill, fillPlain, placeholders } from "./template";

function assertNever(value: never): never {
  throw new RenderError(`No message catalog for locale ${String(value)}`);
}

/** The catalog of a supported locale. An unknown one is a bug, never a silent Russian fallback. */
export function getCatalog(locale: Locale): Catalog {
  switch (locale) {
    case "ru":
      return ru;
    case "en":
      return en;
    default:
      return assertNever(locale);
  }
}
