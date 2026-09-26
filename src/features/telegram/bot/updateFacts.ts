import type { Chat, Update } from "grammy/types";
import type { ChatContext, Locale } from "../domain";

/**
 * Facts read from an update without any I/O: which locale to speak, whether it
 * is a personal or a group conversation, what kind of update it is. They are
 * safe to log (no user content, no identifiers).
 */

/**
 * The product's default locale, used when the client reports no language or
 * one we do not translate. Russian first (ADR 0002, spec): it is a product
 * rule, not a guess about the user.
 */
export const DEFAULT_LOCALE: Locale = "ru";

/**
 * Locale for a user who has no stored settings yet: the base language of the
 * Telegram `language_code` (`ru`, `ru-RU` -> ru; `en`, `en-US` -> en), any
 * other language or none -> `DEFAULT_LOCALE`. A stored `settings.locale`
 * always wins over this (see `enrichContext`).
 */
export function deriveLocale(languageCode: string | undefined): Locale {
  const base = languageCode?.toLowerCase().split(/[-_]/)[0];
  if (base === "ru") return "ru";
  if (base === "en") return "en";
  return DEFAULT_LOCALE;
}

/** A chat type, plus `sender` (an inline query typed in the user's own chat with the bot). */
export type ChatKind = Chat["type"] | "sender";

/**
 * PERSONAL for private chats, CHAT for groups, supergroups and channels. An
 * update with no chat (an inline query, a callback from an inline message) is
 * the user acting for themselves: PERSONAL.
 */
export function chatContextOf(chat: { readonly type: ChatKind } | undefined): ChatContext {
  if (chat === undefined) return "PERSONAL";
  switch (chat.type) {
    case "private":
    case "sender":
      return "PERSONAL";
    case "group":
    case "supergroup":
    case "channel":
      return "CHAT";
    default:
      return assertNever(chat.type);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled chat type: ${String(value)}`);
}

/** The single update field that is set (`message`, `callback_query`, ...). */
export function updateKindOf(update: Update): string {
  return Object.keys(update).find((key) => key !== "update_id") ?? "unknown";
}

/** Where an update happened, for logs: the chat type, the inline query's chat type, or `none`. */
export function chatTypeOf(source: {
  readonly chat?: { readonly type: string };
  readonly inlineQuery?: { readonly chat_type?: string };
}): string {
  return source.chat?.type ?? source.inlineQuery?.chat_type ?? "none";
}
