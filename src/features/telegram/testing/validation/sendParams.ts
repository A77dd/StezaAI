import type {
  ForceReply,
  InlineKeyboardMarkup,
  ReplyKeyboardMarkup,
  ReplyKeyboardRemove,
} from "grammy/types";
import { readChatTarget } from "./chat";
import type { ChatTarget } from "./chat";
import {
  optionalBoolean,
  optionalInteger,
  optionalString,
  rejectUnmodelled,
  requireRecord,
} from "./guards";
import type { Payload } from "./guards";
import { assertInlineKeyboard, assertReplyMarkup } from "./keyboard";
import { badRequest } from "./rejection";
import { parseFormattedText } from "./text";

/** Looks up a message the fake knows in a numeric chat. */
export type MessageLookup = (
  chatId: number,
  messageId: number,
) => { readonly text?: string } | undefined;

export type ReplyTarget = {
  readonly chatId: number | string;
  readonly messageId?: number;
  readonly ephemeralMessageId?: number;
};

export type EphemeralParams = {
  readonly receiverUserId: number;
  readonly callbackQueryId: string | undefined;
  readonly replaceCallbackQueryMessage: boolean;
};

export type ReplyMarkup =
  | InlineKeyboardMarkup
  | ReplyKeyboardMarkup
  | ReplyKeyboardRemove
  | ForceReply;

/** What every send method (`sendMessage`, `sendRichMessage`, `sendDocument`) takes besides its content. */
export type SendParams = {
  readonly chat: ChatTarget;
  readonly threadId: number | undefined;
  readonly reply: ReplyTarget | undefined;
  readonly effectId: string | undefined;
  readonly ephemeral: EphemeralParams | undefined;
  readonly replyMarkup: ReplyMarkup | undefined;
};

const QUOTE_LIMIT = 1024;
const UNMODELLED = ["business_connection_id", "direct_messages_topic_id", "suggested_post_parameters"];

function readEphemeral(payload: Payload, chat: ChatTarget): EphemeralParams | undefined {
  if (payload.ephemeral_message_parameters === undefined) return undefined;
  const parameters = requireRecord(payload.ephemeral_message_parameters, "ephemeral_message_parameters");
  if (chat.kind === "private") {
    throw badRequest("ephemeral messages can only be sent to group chats");
  }
  const receiverUserId = optionalInteger(parameters, "receiver_user_id", 1);
  if (receiverUserId === undefined) throw badRequest("receiver_user_id is required for ephemeral messages");
  const callbackQueryId = optionalString(parameters, "callback_query_id");
  return {
    receiverUserId,
    callbackQueryId,
    replaceCallbackQueryMessage: optionalBoolean(parameters, "replace_callback_query_message") ?? false,
  };
}

function readReply(payload: Payload, chat: ChatTarget, lookup: MessageLookup): ReplyTarget | undefined {
  const legacyId = optionalInteger(payload, "reply_to_message_id", 1);
  if (payload.reply_parameters === undefined) {
    return legacyId === undefined ? undefined : readReply({ reply_parameters: { message_id: legacyId } }, chat, lookup);
  }
  const parameters = requireRecord(payload.reply_parameters, "reply_parameters");
  const messageId = optionalInteger(parameters, "message_id", 1);
  const ephemeralMessageId = optionalInteger(parameters, "ephemeral_message_id", 1);
  if (messageId === undefined && ephemeralMessageId === undefined) {
    throw badRequest("message identifier is not specified");
  }
  const allowMissing = optionalBoolean(parameters, "allow_sending_without_reply") === true;
  const replyChat = parameters.chat_id === undefined ? chat : readChatTarget(parameters);
  const quote =
    parameters.quote === undefined
      ? undefined
      : parseFormattedText(
          { text: parameters.quote, parseMode: parameters.quote_parse_mode, entities: parameters.quote_entities },
          { minimum: 0, maximum: QUOTE_LIMIT, empty: "", tooLong: "quote is too long" },
        );

  if (messageId !== undefined && typeof replyChat.id === "number") {
    const original = lookup(replyChat.id, messageId);
    if (original === undefined && !allowMissing && parameters.chat_id === undefined) {
      throw badRequest("message to be replied not found");
    }
    // UNVERIFIED: only the quote's text is compared; the reference also asks
    // for matching entities, and the real error wording is not documented.
    if (
      quote !== undefined &&
      original?.text !== undefined &&
      !original.text.includes(quote.text)
    ) {
      throw badRequest("quote not found in the message to reply to");
    }
  }
  return messageId === undefined
    ? { chatId: replyChat.id, ephemeralMessageId }
    : { chatId: replyChat.id, messageId };
}

/**
 * Parameters shared by the send methods (Bot API `sendMessage` reference):
 * chat, thread, reply target, effect (private chats only), ephemeral
 * parameters (group chats, needs a triggering callback query or an ephemeral
 * reply for a bot that is not an administrator) and `reply_markup`.
 *
 * Business, channel direct message and suggested post parameters are not
 * modelled and are rejected. `message_effect_id` is not checked against a list
 * of effects (the documentation publishes none, research 5.3).
 * UNVERIFIED: description texts for the effect, ephemeral and quote rules.
 * UNVERIFIED: the fake treats the bot as a non-administrator, so an ephemeral
 * message needs `callback_query_id` or an ephemeral reply (research 5.8).
 */
export function readSendParams(payload: Payload, lookup: MessageLookup): SendParams {
  rejectUnmodelled(payload, UNMODELLED);
  const chat = readChatTarget(payload);
  const threadId = optionalInteger(payload, "message_thread_id", 1);
  for (const flag of ["disable_notification", "protect_content", "allow_paid_broadcast"]) {
    optionalBoolean(payload, flag);
  }

  const effectId = optionalString(payload, "message_effect_id");
  if (effectId !== undefined) {
    if (effectId === "") throw badRequest("message_effect_id is empty");
    if (chat.kind !== "private") throw badRequest("message effects are available only in private chats");
  }

  const ephemeral = readEphemeral(payload, chat);
  const reply = readReply(payload, chat, lookup);
  if (reply?.ephemeralMessageId !== undefined && ephemeral === undefined) {
    throw badRequest("a reply to an ephemeral message must itself be an ephemeral message");
  }
  if (ephemeral !== undefined && ephemeral.callbackQueryId === undefined && reply?.ephemeralMessageId === undefined) {
    throw badRequest("callback_query_id or reply_parameters.ephemeral_message_id is required for ephemeral messages");
  }

  const rawMarkup = payload.reply_markup;
  let replyMarkup: ReplyMarkup | undefined;
  if (rawMarkup !== undefined) {
    if (ephemeral !== undefined) {
      assertInlineKeyboard(rawMarkup, { chatKind: chat.kind, ephemeral: true });
    } else {
      assertReplyMarkup(rawMarkup, { chatKind: chat.kind });
    }
    replyMarkup = rawMarkup;
  }
  return { chat, threadId, reply, effectId, ephemeral, replyMarkup };
}
