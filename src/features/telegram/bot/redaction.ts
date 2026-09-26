import type { LogFields, LogValue } from "./logger";

/** What replaces a sensitive value in a log record. */
export const REDACTED = "[redacted]";

// Bot tokens look like `<digits>:<35+ url-safe characters>` (the same shape
// `parseTelegramConfig` requires). A token can hide inside a URL or an error
// message, so it is replaced wherever it appears in a string.
const BOT_TOKEN = /\d+:[A-Za-z0-9_-]{35,}/g;

/**
 * Field names whose values are user content or credentials, compared after
 * lower-casing and dropping `_`/`-` (`callback_data`, `callbackData` and
 * `Callback-Data` are one name). Message text is user content and must not be
 * logged by default.
 */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  "text",
  "messagetext",
  "sourcetext",
  "caption",
  "callbackdata",
  "data",
  "query",
  "inlinequery",
  "firstname",
  "lastname",
  "username",
  "phone",
  "phonenumber",
  "email",
  "authorization",
  "initdata",
  "cookie",
]);

// Credentials come in many spellings (`botToken`, `secret_token`, `apiKey`).
const SENSITIVE_SUFFIXES = ["token", "secret", "password", "apikey"] as const;

const MAX_DEPTH = 6;
const MAX_STRING_LENGTH = 500;
const TRUNCATED = "[truncated]";

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

/** Replaces every bot token found in `value` (also inside URLs). */
export function redactTokens(value: string): string {
  return value.replace(BOT_TOKEN, REDACTED);
}

function redactString(value: string): string {
  const clean = redactTokens(value);
  return clean.length > MAX_STRING_LENGTH ? `${clean.slice(0, MAX_STRING_LENGTH)}…${TRUNCATED}` : clean;
}

/**
 * Builds the function that makes a record safe to write: values under
 * sensitive keys are replaced, bot tokens are removed from all strings, long
 * strings are capped and very deep structures are cut. It works on a copy.
 */
export function createRedactor(extraKeys: readonly string[] = []): (fields: LogFields) => LogFields {
  const sensitive = new Set([...SENSITIVE_KEYS, ...extraKeys.map(normalizeKey)]);

  const isSensitive = (key: string): boolean => {
    const name = normalizeKey(key);
    return sensitive.has(name) || SENSITIVE_SUFFIXES.some((suffix) => name.endsWith(suffix));
  };

  const redactValue = (value: LogValue, depth: number): LogValue => {
    if (typeof value === "string") return redactString(value);
    if (typeof value !== "object" || value === null) return value;
    if (depth >= MAX_DEPTH) return TRUNCATED;
    if (Array.isArray(value)) return value.map((item: LogValue) => redactValue(item, depth + 1));
    return redactRecord(value as LogFields, depth + 1);
  };

  const redactRecord = (record: LogFields, depth: number): LogFields => {
    const result: Record<string, LogValue> = {};
    for (const [key, value] of Object.entries(record)) {
      if (value === undefined) continue;
      result[key] = isSensitive(key) ? REDACTED : redactValue(value, depth);
    }
    return result;
  };

  return (fields) => redactRecord(fields, 0);
}
