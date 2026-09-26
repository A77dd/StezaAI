import type { LinkPreviewOptions } from "grammy/types";
import { EntityParseError, validateEntities } from "../entityRules";
import { parseTelegramHtml } from "../htmlOracle";
import type { ParsedText } from "../htmlOracle";
import { isRecord, optionalBoolean, optionalString } from "./guards";
import type { Payload } from "./guards";
import { badRequest } from "./rejection";

/** "1-4096 characters after entities parsing" (`sendMessage`). */
export const TEXT_LIMIT = 4096;
/** "0-1024 characters after entities parsing" (captions). */
export const CAPTION_LIMIT = 1024;

const PARSE_MODES: readonly string[] = ["HTML", "Markdown", "MarkdownV2"];

type TextSource = {
  readonly text: unknown;
  readonly parseMode: unknown;
  readonly entities: unknown;
};

type TextRules = {
  readonly minimum: 0 | 1;
  readonly maximum: number;
  readonly empty: string;
  readonly tooLong: string;
};

function withParseErrors<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof EntityParseError) throw badRequest(`can't parse entities: ${error.message}`);
    throw error;
  }
}

/**
 * Turns a text with its `parse_mode` or `entities` into what the reader sees.
 * The length limits apply to that visible text, in UTF-16 code units.
 *
 * UNVERIFIED: whitespace-only text counts as empty (Telegram trims), but the
 * limit is measured on the untrimmed text.
 * UNVERIFIED: `parse_mode` together with non-empty `entities` is rejected; the
 * reference only says entities can be given "instead of" a parse mode, and
 * Telegram may just ignore the parse mode.
 * UNVERIFIED: parse mode names are case sensitive here, as in the types.
 * Deliberate gap: "Markdown" and "MarkdownV2" are not modelled (the project
 * uses HTML only, research 5.1), so they are rejected instead of accepted
 * unchecked.
 */
export function parseFormattedText(source: TextSource, rules: TextRules): ParsedText {
  const { text, parseMode, entities } = source;
  if (text !== undefined && typeof text !== "string") throw badRequest("text must be a string");
  const raw = text ?? "";
  if (parseMode !== undefined && (typeof parseMode !== "string" || !PARSE_MODES.includes(parseMode))) {
    throw badRequest("unsupported parse_mode");
  }
  const hasEntities = Array.isArray(entities) && entities.length > 0;
  if (parseMode !== undefined && hasEntities) {
    throw badRequest("parse_mode and entities can't be used together");
  }

  let parsed: ParsedText;
  if (parseMode === "HTML") {
    parsed = withParseErrors(() => parseTelegramHtml(raw));
  } else if (parseMode !== undefined) {
    throw badRequest(`the fake Bot API does not model parse_mode ${String(parseMode)}; use HTML`);
  } else if (entities !== undefined) {
    parsed = { text: raw, entities: withParseErrors(() => validateEntities(raw, entities)) };
  } else {
    parsed = { text: raw, entities: [] };
  }

  if (rules.minimum === 1 && parsed.text.trim() === "") throw badRequest(rules.empty);
  if (parsed.text.length > rules.maximum) throw badRequest(rules.tooLong);
  return parsed;
}

const MESSAGE_RULES: TextRules = {
  minimum: 1,
  maximum: TEXT_LIMIT,
  empty: "message text is empty",
  tooLong: "message is too long",
};

/** `text` + `parse_mode` / `entities`, 1-4096 after parsing. */
export function readMessageText(payload: Payload): ParsedText {
  return parseFormattedText(
    { text: payload.text, parseMode: payload.parse_mode, entities: payload.entities },
    MESSAGE_RULES,
  );
}

/** `message_text` of an inline `InputTextMessageContent`, 1-4096 after parsing. */
export function readInputMessageText(content: Payload): ParsedText {
  return parseFormattedText(
    { text: content.message_text, parseMode: content.parse_mode, entities: content.entities },
    MESSAGE_RULES,
  );
}

/** Draft `text`: 0-4096 after parsing; an empty text shows "Thinking...". */
export function readDraftText(payload: Payload): ParsedText {
  return parseFormattedText(
    { text: payload.text, parseMode: payload.parse_mode, entities: payload.entities },
    { ...MESSAGE_RULES, minimum: 0 },
  );
}

/** `caption` + `caption_entities`, 0-1024 after parsing; `undefined` without a caption. */
export function readOptionalCaption(payload: Payload): ParsedText | undefined {
  if (payload.caption === undefined) return undefined;
  return parseFormattedText(
    { text: payload.caption, parseMode: payload.parse_mode, entities: payload.caption_entities },
    { minimum: 0, maximum: CAPTION_LIMIT, empty: "", tooLong: "message caption is too long" },
  );
}

/** `link_preview_options`: the documented booleans and an optional `url`. */
export function readLinkPreviewOptions(value: unknown): LinkPreviewOptions | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw badRequest("link_preview_options must be an object");
  const options: LinkPreviewOptions = {};
  const flags = ["is_disabled", "prefer_small_media", "prefer_large_media", "show_above_text"] as const;
  for (const flag of flags) {
    const flagValue = optionalBoolean(value, flag);
    if (flagValue !== undefined) options[flag] = flagValue;
  }
  const url = optionalString(value, "url");
  if (url !== undefined) options.url = url;
  return options;
}
