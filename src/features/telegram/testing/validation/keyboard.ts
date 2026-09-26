import type {
  ForceReply,
  InlineKeyboardMarkup,
  ReplyKeyboardMarkup,
  ReplyKeyboardRemove,
} from "grammy/types";
import { isAcceptedLinkUrl } from "../entityRules";
import type { ChatKind } from "./chat";
import { characterCount, isRecord, utf8Bytes } from "./guards";
import type { Payload } from "./guards";
import { badRequest } from "./rejection";

/**
 * Keyboard validation (research 4.1 and 5.4, `InlineKeyboardButton`
 * reference): exactly one action per inline button, `callback_data` 1-64
 * BYTES, https for `web_app` and `login_url`, `copy_text` 1-256 characters,
 * style one of primary / success / danger.
 *
 * UNVERIFIED: at most 100 buttons per keyboard and 8 per row (both rejected as
 * REPLY_MARKUP_TOO_LONG). The reference states neither for the inline
 * keyboard; they are the long-standing server limits the plan asks the fake to
 * enforce.
 * UNVERIFIED: description texts (BUTTON_DATA_INVALID, BUTTON_URL_INVALID,
 * REPLY_MARKUP_TOO_LONG, "text buttons are unallowed...") are what the real
 * API is known to answer; the rest are generic wording.
 * UNVERIFIED: an empty label is rejected, `icon_custom_emoji_id` is accepted
 * without checking the bot owner's Premium status, and
 * `switch_inline_query_chosen_chat` needs at least one allowed chat kind.
 */

export const CALLBACK_DATA_MAX_BYTES = 64;
export const COPY_TEXT_MAX_CHARACTERS = 256;
export const INLINE_BUTTONS_MAX = 100;
export const INLINE_BUTTONS_PER_ROW_MAX = 8;
const SWITCH_INLINE_QUERY_MAX = 256;
const PLACEHOLDER_MAX = 64;

export type ButtonContext = {
  /** Where the keyboard is sent; unset for inline query results. */
  readonly chatKind?: ChatKind;
  readonly ephemeral?: boolean;
};

const ACTION_FIELDS = [
  "url",
  "callback_data",
  "web_app",
  "login_url",
  "disabled",
  "switch_inline_query",
  "switch_inline_query_current_chat",
  "switch_inline_query_chosen_chat",
  "copy_text",
  "callback_game",
  "pay",
] as const;

const STYLES: readonly unknown[] = ["primary", "success", "danger"];
const CHOSEN_CHAT_FLAGS = ["allow_user_chats", "allow_bot_chats", "allow_group_chats", "allow_channel_chats"];

function isHttpsUrl(value: unknown): boolean {
  return typeof value === "string" && URL.canParse(value) && new URL(value).protocol === "https:";
}

function assertWebApp(value: unknown, context: ButtonContext): void {
  if (!isRecord(value) || !isHttpsUrl(value.url)) throw badRequest("BUTTON_URL_INVALID");
  if (context.chatKind !== undefined && context.chatKind !== "private") {
    throw badRequest("web_app buttons are available only in private chats");
  }
}

function assertLoginUrl(value: unknown, context: ButtonContext): void {
  if (!isRecord(value) || !isHttpsUrl(value.url)) throw badRequest("BUTTON_URL_INVALID");
  if (context.ephemeral === true) throw badRequest("login_url buttons are not supported in ephemeral messages");
}

function assertSwitchQuery(value: unknown): void {
  if (typeof value !== "string" || characterCount(value) > SWITCH_INLINE_QUERY_MAX) {
    throw badRequest("BUTTON_TYPE_INVALID");
  }
}

function assertAction(field: (typeof ACTION_FIELDS)[number], value: unknown, context: ButtonContext): void {
  switch (field) {
    case "callback_data":
      if (typeof value !== "string" || value === "" || utf8Bytes(value) > CALLBACK_DATA_MAX_BYTES) {
        throw badRequest("BUTTON_DATA_INVALID");
      }
      return;
    case "url":
      if (typeof value !== "string" || !isAcceptedLinkUrl(value)) throw badRequest("BUTTON_URL_INVALID");
      return;
    case "web_app":
      return assertWebApp(value, context);
    case "login_url":
      return assertLoginUrl(value, context);
    case "copy_text":
      if (
        !isRecord(value) ||
        typeof value.text !== "string" ||
        characterCount(value.text) < 1 ||
        characterCount(value.text) > COPY_TEXT_MAX_CHARACTERS
      ) {
        throw badRequest("BUTTON_COPY_TEXT_INVALID");
      }
      return;
    case "disabled":
      if (!isRecord(value)) throw badRequest("BUTTON_TYPE_INVALID");
      return;
    case "switch_inline_query":
    case "switch_inline_query_current_chat":
      return assertSwitchQuery(value);
    case "switch_inline_query_chosen_chat":
      if (!isRecord(value) || !CHOSEN_CHAT_FLAGS.some((flag) => value[flag] === true)) {
        throw badRequest("BUTTON_TYPE_INVALID");
      }
      if (value.query !== undefined) assertSwitchQuery(value.query);
      return;
    case "pay":
      throw badRequest("pay buttons can only be used in invoice messages");
    case "callback_game":
      throw badRequest("callback_game buttons can only be used in game messages");
  }
}

function assertInlineButton(button: unknown, context: ButtonContext): void {
  if (!isRecord(button)) throw badRequest("inline keyboard button must be an object");
  if (typeof button.text !== "string" || button.text === "") {
    throw badRequest("inline keyboard button text is empty");
  }
  if (button.style !== undefined && !STYLES.includes(button.style)) {
    throw badRequest("BUTTON_STYLE_INVALID");
  }
  if (button.icon_custom_emoji_id !== undefined && typeof button.icon_custom_emoji_id !== "string") {
    throw badRequest("icon_custom_emoji_id must be a string");
  }
  const present = ACTION_FIELDS.filter((field) => button[field] !== undefined);
  const [field, ...others] = present;
  if (field === undefined) throw badRequest("text buttons are unallowed in the inline keyboard");
  if (others.length > 0) {
    throw badRequest("can't parse inline keyboard button: exactly one action field must be used");
  }
  assertAction(field, button[field], context);
}

/** Asserts a well-formed `InlineKeyboardMarkup` as the Bot API would accept it. */
export function assertInlineKeyboard(
  value: unknown,
  context: ButtonContext = {},
): asserts value is InlineKeyboardMarkup {
  if (!isRecord(value) || !Array.isArray(value.inline_keyboard)) {
    throw badRequest("reply markup must be an inline keyboard (InlineKeyboardMarkup with inline_keyboard)");
  }
  if (value.force_reply !== undefined && typeof value.force_reply !== "boolean") {
    throw badRequest("force_reply must be a boolean");
  }
  let total = 0;
  for (const row of value.inline_keyboard as unknown[]) {
    if (!Array.isArray(row)) throw badRequest("inline_keyboard rows must be arrays");
    if (row.length > INLINE_BUTTONS_PER_ROW_MAX) throw badRequest("REPLY_MARKUP_TOO_LONG");
    total += row.length;
    if (total > INLINE_BUTTONS_MAX) throw badRequest("REPLY_MARKUP_TOO_LONG");
    for (const button of row as unknown[]) assertInlineButton(button, context);
  }
}

/**
 * The keyboard as compared for "message is not modified": empty rows and an
 * empty keyboard both mean "no keyboard".
 */
export function normalizeInlineMarkup(markup: InlineKeyboardMarkup): InlineKeyboardMarkup | null {
  const rows = markup.inline_keyboard.filter((row) => row.length > 0);
  if (rows.length === 0) return null;
  return markup.force_reply === undefined
    ? { inline_keyboard: rows }
    : { inline_keyboard: rows, force_reply: markup.force_reply };
}

const REQUEST_FIELDS = [
  "request_users",
  "request_chat",
  "request_managed_bot",
  "request_contact",
  "request_location",
  "request_poll",
  "web_app",
] as const;

function assertPlaceholder(value: unknown): void {
  if (value === undefined) return;
  if (typeof value !== "string" || value === "" || characterCount(value) > PLACEHOLDER_MAX) {
    throw badRequest("input_field_placeholder must be 1-64 characters");
  }
}

function assertKeyboardButton(button: unknown, context: ButtonContext): void {
  if (typeof button === "string") {
    if (button === "") throw badRequest("keyboard button text is empty");
    return;
  }
  if (!isRecord(button)) throw badRequest("keyboard button must be a string or an object");
  if (typeof button.text !== "string" || button.text === "") {
    throw badRequest("keyboard button text is empty");
  }
  const present = REQUEST_FIELDS.filter((field) => button[field] !== undefined);
  if (present.length > 1) throw badRequest("keyboard button can use at most one request field");
  if (present.length === 1 && context.chatKind !== undefined && context.chatKind !== "private") {
    throw badRequest("request and web_app keyboard buttons are available only in private chats");
  }
  if (button.web_app !== undefined && !(isRecord(button.web_app) && isHttpsUrl(button.web_app.url))) {
    throw badRequest("BUTTON_URL_INVALID");
  }
}

function assertReplyKeyboard(value: Payload, context: ButtonContext): void {
  if (!Array.isArray(value.keyboard)) throw badRequest("keyboard must be an array of rows");
  assertPlaceholder(value.input_field_placeholder);
  for (const row of value.keyboard as unknown[]) {
    if (!Array.isArray(row)) throw badRequest("keyboard rows must be arrays");
    for (const button of row as unknown[]) assertKeyboardButton(button, context);
  }
}

/**
 * Asserts any `reply_markup` a send method takes: an inline keyboard, a reply
 * keyboard, a keyboard removal or a forced reply.
 *
 * UNVERIFIED: reply keyboard limits beyond shape (row and button counts) are
 * not enforced.
 */
export function assertReplyMarkup(
  value: unknown,
  context: ButtonContext = {},
): asserts value is InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove | ForceReply {
  if (!isRecord(value)) throw badRequest("reply markup must be an object");
  const kinds = ["inline_keyboard", "keyboard", "remove_keyboard"].filter((key) => value[key] !== undefined);
  if (value.force_reply === true && kinds.length === 0) {
    assertPlaceholder(value.input_field_placeholder);
    return;
  }
  const [kind, ...others] = kinds;
  if (kind === undefined || others.length > 0) {
    throw badRequest("reply markup must be exactly one of the four reply markup types");
  }
  if (kind === "inline_keyboard") return assertInlineKeyboard(value, context);
  if (kind === "keyboard") return assertReplyKeyboard(value, context);
  if (value.remove_keyboard !== true) throw badRequest("remove_keyboard must be true");
}
