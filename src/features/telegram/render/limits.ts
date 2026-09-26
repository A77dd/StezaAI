import { MAX_CALLBACK_DATA_BYTES } from "../callbacks";
import { MessageTooLongError } from "./errors";
import type { Html } from "./htmlType";
import { tokenizeHtml } from "./htmlTokens";

/**
 * Telegram size limits used by the renderer. Sources: Bot API reference
 * ("1-4096 characters after entities parsing", "0-1024 characters after
 * entities parsing", rich messages 32768) and `docs/research/TELEGRAM_BOT_API.md`
 * sections 5.1, 5.2 and 5.4.
 */

export const TEXT_LIMIT = 4096;
export const CAPTION_LIMIT = 1024;
/**
 * Rich messages: the Bot API says "32768 UTF-8 characters", which may mean
 * bytes. It is enforced as BYTES (`utf8Length`): a byte count is never lower
 * than a character count, so a message that passes cannot be rejected for
 * either reading.
 */
export const RICH_LIMIT = 32768;

/** Size of a string once encoded as UTF-8, the unit `RICH_LIMIT` is checked in. */
export function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** One source of truth with the codec: `callback_data` is 1-64 BYTES, not characters. */
export const CALLBACK_DATA_LIMIT_BYTES = MAX_CALLBACK_DATA_BYTES;

/** `CopyTextButton.text`: "1-256 characters" (Bot API reference, research 5.4). */
export const COPY_TEXT_LIMIT = 256;

/** Inline query typed into the input field by a switch-inline button: up to 256 characters. */
export const INLINE_QUERY_LIMIT = 256;

/**
 * Team rule, not a Telegram error: button labels are 1-64 characters. Telegram
 * does not reject longer labels, it truncates them on screen, so a longer
 * label is a readability bug we want to catch before it ships.
 */
export const BUTTON_TEXT_LIMIT = 64;

/**
 * Inline keyboard shape limits: at most 8 buttons per row and 100 in total.
 * The Bot API page states neither for `InlineKeyboardMarkup` (only rich
 * `RichBlockButtons` says "1-8 buttons"); they are the long-standing server
 * limits, and the plan's fake Bot API also rejects more than 100 buttons.
 * Re-verify against a real bot (`MANUAL_QA.md`) before relying on the edges.
 */
export const BUTTONS_PER_ROW_LIMIT = 8;
export const KEYBOARD_BUTTONS_LIMIT = 100;

/**
 * Length Telegram checks: the text the reader sees after tags are stripped and
 * entities (`&amp;` and numeric ones) are decoded, in UTF-16 code units, the
 * unit Telegram uses for entity offsets. An astral character (most emoji)
 * therefore counts 2. Counting code units is never lower than counting code
 * points, so this can reject a message Telegram would just accept, never the
 * reverse. The text of a `tg-time` tag counts: it is the entity body.
 */
export function visibleLength(html: Html): number {
  let length = 0;
  for (const token of tokenizeHtml(html)) {
    if (token.kind === "text") length += token.text.length;
  }
  return length;
}

/**
 * Throws `MessageTooLongError` when the fragment is over `limit`; never
 * shortens anything. Views that can lose text gracefully opt into
 * `truncateHtml` explicitly.
 */
export function assertWithinLimit(html: Html, limit: number): Html {
  const actual = visibleLength(html);
  if (actual > limit) throw new MessageTooLongError(limit, actual);
  return html;
}
