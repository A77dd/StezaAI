import type { InlineKeyboardMarkup, LinkPreviewOptions } from "grammy/types";
import type { ParsedText } from "../htmlOracle";
import { readChatTarget } from "./chat";
import { requireInteger } from "./guards";
import type { Payload } from "./guards";
import { assertInlineKeyboard, normalizeInlineMarkup } from "./keyboard";
import { readRichContent } from "./messages";
import type { RichContent } from "./messages";
import { badRequest } from "./rejection";
import { readLinkPreviewOptions, readMessageText } from "./text";

export type EphemeralRef = {
  readonly chatId: number | string;
  readonly receiverUserId: number;
  readonly ephemeralMessageId: number;
};

/** `chat_id` + `receiver_user_id` + `ephemeral_message_id`: group chats only (research 5.8). */
export function readEphemeralRef(payload: Payload): EphemeralRef {
  const chat = readChatTarget(payload);
  if (chat.kind === "private") throw badRequest("ephemeral messages exist only in group chats");
  return {
    chatId: chat.id,
    receiverUserId: requireInteger(payload, "receiver_user_id", 1, "receiver_user_id is empty"),
    ephemeralMessageId: requireInteger(payload, "ephemeral_message_id", 1, "ephemeral message identifier is not specified"),
  };
}

function readMarkup(payload: Payload): InlineKeyboardMarkup | null {
  const raw = payload.reply_markup;
  if (raw === undefined) return null;
  assertInlineKeyboard(raw, { ephemeral: true });
  return normalizeInlineMarkup(raw);
}

export type EditEphemeralTextRequest = {
  readonly ref: EphemeralRef;
  readonly content:
    | { readonly kind: "text"; readonly text: ParsedText; readonly linkPreview: LinkPreviewOptions | undefined }
    | { readonly kind: "rich"; readonly rich: RichContent };
  readonly markup: InlineKeyboardMarkup | null;
};

export function readEditEphemeralText(payload: Payload): EditEphemeralTextRequest {
  const ref = readEphemeralRef(payload);
  const markup = readMarkup(payload);
  if (payload.rich_message !== undefined) {
    if (payload.text !== undefined) throw badRequest("text and rich_message can't be used together");
    return { ref, content: { kind: "rich", rich: readRichContent(payload.rich_message) }, markup };
  }
  return {
    ref,
    content: {
      kind: "text",
      text: readMessageText(payload),
      linkPreview: readLinkPreviewOptions(payload.link_preview_options),
    },
    markup,
  };
}

export function readEditEphemeralReplyMarkup(payload: Payload): {
  readonly ref: EphemeralRef;
  readonly markup: InlineKeyboardMarkup | null;
} {
  return { ref: readEphemeralRef(payload), markup: readMarkup(payload) };
}

export function readDeleteEphemeralMessage(payload: Payload): EphemeralRef {
  return readEphemeralRef(payload);
}
