import type { KeyboardSpec } from "./buttonSpec";

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
  /**
   * Message effect (private chats only, research 5.3). Never set by render:
   * whether an effect is allowed depends on the chat type, which only the
   * sending layer knows.
   */
  readonly effectId?: string;
};

/** For `sendRichMessage`: Rich Markdown up to 32768 characters. */
export type RenderedRichMessage = {
  readonly kind: "rich";
  readonly markdown: string;
  readonly keyboard: KeyboardSpec | null;
};

export type RenderedMessage = RenderedTextMessage | RenderedRichMessage;
