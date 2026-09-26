import { RenderError } from "./errors";
import { sanitizeText } from "./escape";
import { TIME_FORMAT } from "./html";

/**
 * Helpers for Rich Markdown messages (`renderRichMarkdown` passes Markdown
 * through as written, so whoever builds it escapes user text with these).
 */

// Characters that can open Markdown or Rich Markdown syntax anywhere in a line:
// emphasis, code, links and images, autolinks/HTML, tables, strikethrough,
// math, marked text, entities, headings and the escape character itself.
const MARKDOWN_SPECIAL = /[\\`*_[\]()<>|~$=&!#]/g;

/**
 * Escapes user text for Rich Markdown. CommonMark allows a backslash before
 * any ASCII punctuation, so this only ever adds a backslash before a literal
 * character. NUL and unpaired surrogates are handled like in `escapeHtml`.
 */
export function escapeMarkdown(value: string): string {
  return sanitizeText(value).replace(MARKDOWN_SPECIAL, "\\$&");
}

/**
 * `![fallback](tg://time?unix=..&format=..)`: every reader sees the moment in
 * their own timezone; the alt text is what clients without the entity show.
 */
export function timeLink(unixSeconds: number, format: string, fallbackText: string): string {
  if (!Number.isSafeInteger(unixSeconds) || unixSeconds < 0) {
    throw new RenderError("Unix time must be a non-negative integer number of seconds");
  }
  if (!TIME_FORMAT.test(format)) {
    throw new RenderError("Time format must match r|w?[dD]?[tT]?");
  }
  return `![${escapeMarkdown(fallbackText)}](tg://time?unix=${unixSeconds}&format=${format})`;
}
