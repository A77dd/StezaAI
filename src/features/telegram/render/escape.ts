/**
 * The single place where user-controlled text becomes safe for Telegram's
 * HTML parse mode. Only `&`, `<` and `>` are markup there (plus `"` inside
 * attribute values); Telegram supports just four named entities and numeric
 * ones, so nothing else may be emitted.
 */

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

const REPLACEMENT_CHARACTER = "�";
const NUL = /\u0000/g;
// A high surrogate not followed by a low one, or a low one not preceded by a
// high one. Valid pairs (emoji) never match.
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/**
 * Makes text safe to put on the wire as JSON/UTF-8:
 * - NUL is removed: Telegram rejects it and it has no visible meaning;
 * - a lone (unpaired) UTF-16 surrogate is replaced with U+FFFD. It cannot be
 *   encoded as UTF-8, so a request carrying it is rejected or garbled. It is
 *   replaced rather than dropped so the damage stays visible in the message.
 */
export function sanitizeText(text: string): string {
  return text.replace(NUL, "").replace(LONE_SURROGATE, REPLACEMENT_CHARACTER);
}

/** Escapes text for an element body: `&`, `<`, `>`. Already-escaped input is escaped again, never decoded. */
export function escapeHtml(text: string): string {
  return sanitizeText(text).replace(/[&<>]/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Like `escapeHtml`, and `"` too, so a value cannot end a double-quoted attribute. */
export function escapeHtmlAttribute(value: string): string {
  return sanitizeText(value).replace(/[&<>"]/g, (char) => HTML_ESCAPES[char] ?? char);
}
