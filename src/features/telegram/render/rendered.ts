import type { ActionButtonSpec, KeyboardSpec } from "./buttonSpec";

/**
 * What `render/` produces: plain data with no grammY types. A later layer
 * (handlers) turns `keyboard` into `reply_markup` (issuing callback tokens on
 * the way) and picks the Bot API method from `kind`.
 */

/** For `sendMessage` / `editMessageText`. */
export type RenderedTextMessage = {
  readonly kind: "text";
  /** Telegram HTML, at most 4096 characters after entity parsing. */
  readonly text: string;
  readonly parseMode: "HTML";
  /** Maps to `link_preview_options: { is_disabled: true }`: cards must stay compact. */
  readonly linkPreview: "disabled";
  readonly keyboard: KeyboardSpec | null;
};

/** For `sendRichMessage`: Rich Markdown up to 32768 bytes (UTF-8). */
export type RenderedRichMessage = {
  readonly kind: "rich";
  readonly markdown: string;
  readonly keyboard: KeyboardSpec | null;
};

/**
 * For `sendRichMessage` with Rich HTML and buttons INSIDE the message body
 * (`<tg-button>`, Bot API 10.3): the interactive calendar cards (research
 * §5.2). `html` carries `{{cb:N}}` placeholders — one per entry of `actions`,
 * in order; the presenter replaces each with bound `callback_data` (the same
 * 64-byte codec as reply_markup keyboards). No `reply_markup` is sent.
 */
export type RenderedRichHtmlMessage = {
  readonly kind: "rich_html";
  readonly html: string;
  readonly actions: readonly ActionButtonSpec[];
  readonly keyboard: null;
};

export type RenderedMessage = RenderedTextMessage | RenderedRichMessage | RenderedRichHtmlMessage;
