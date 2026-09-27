import type { RenderedTextMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import { text } from "../html";
import type { Catalog } from "../catalog";
import type { ViewContext } from "./context";

/**
 * Short user-facing notices for things that went wrong or are no longer
 * possible: an expired button, an already used one, an unavailable one...
 * They are chosen from an error CODE only, never from a message or a
 * `reason`: an ownership failure must be indistinguishable from an unknown
 * button, and no user text can leak into a notice.
 */

export const NOTICE_KINDS = [
  "expired",
  "already_used",
  "unavailable",
  "unsupported_chat",
  "slot_conflict",
  "not_found",
  "transcription_unavailable",
  "voice_unavailable",
  "voice_too_large",
  "voice_unsupported",
  "intent_parser_unavailable",
  "invalid_timezone",
  "failure",
] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

export type Notice = {
  readonly kind: NoticeKind;
  /**
   * Plain text (no markup), at most 200 characters: fits an
   * `answerCallbackQuery` alert or toast as is.
   */
  readonly text: string;
  /** The same text as a message, for chats where a reply is better than a toast. */
  readonly message: RenderedTextMessage;
};

/** Error codes (`TelegramLayerError.code`) that have a notice of their own. */
const NOTICE_BY_CODE: Readonly<Record<string, NoticeKind>> = {
  callback_expired: "expired",
  callback_replayed: "already_used",
  // A button of someone else, a forged one and a broken one all read the same.
  callback_not_found: "unavailable",
  callback_malformed: "unavailable",
  callback_unsupported_version: "unavailable",
  callback_unknown_action: "unavailable",
  slot_conflict: "slot_conflict",
  not_found: "not_found",
  transcription_unavailable: "transcription_unavailable",
  voice_unavailable: "voice_unavailable",
  voice_too_large: "voice_too_large",
  voice_unsupported: "voice_unsupported",
  intent_parser_unavailable: "intent_parser_unavailable",
  invalid_timezone: "invalid_timezone",
};

const COPY_KEY: Readonly<Record<NoticeKind, keyof Catalog["notices"]>> = {
  expired: "expired",
  already_used: "alreadyUsed",
  unavailable: "unavailable",
  unsupported_chat: "unsupportedChat",
  slot_conflict: "slotConflict",
  not_found: "notFound",
  transcription_unavailable: "transcriptionUnavailable",
  voice_unavailable: "voiceUnavailable",
  voice_too_large: "voiceTooLarge",
  voice_unsupported: "voiceUnsupported",
  intent_parser_unavailable: "intentParserUnavailable",
  invalid_timezone: "invalidTimezone",
  failure: "failure",
};

export function noticeForKind(kind: NoticeKind, ctx: ViewContext): Notice {
  const copy = ctx.catalog.notices[COPY_KEY[kind]];
  return { kind, text: copy, message: renderMessage({ body: text(copy) }) };
}

/** The notice for an error code; a code without a notice of its own is the generic failure. */
export function noticeForErrorCode(code: string, ctx: ViewContext): Notice {
  const kind = Object.hasOwn(NOTICE_BY_CODE, code) ? NOTICE_BY_CODE[code] : "failure";
  return noticeForKind(kind, ctx);
}
