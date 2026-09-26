import type { Chat, LinkPreviewOptions, Message } from "grammy/types";
import type { ParsedText } from "../htmlOracle";
import type { FakeState } from "../state/fakeState";
import { badRequest, QUERY_TOO_OLD, tooManyRequests } from "../validation/rejection";
import type { RichContent } from "../validation/messages";
import type { SendParams } from "../validation/sendParams";

/** "An ephemeral message may only be replied to within 15 seconds" (types, research 5.8). */
export const EPHEMERAL_WINDOW_MS = 15_000;

export type OutboundContent =
  | { readonly kind: "text"; readonly text: ParsedText; readonly linkPreview: LinkPreviewOptions | undefined }
  | { readonly kind: "rich"; readonly rich: RichContent }
  | {
      readonly kind: "document";
      readonly document: NonNullable<Message["document"]>;
      readonly caption: ParsedText | undefined;
    };

/**
 * Checks that the bot may write to the chat now: it has not been blocked or
 * removed (403) and flood control admits one more message (429).
 */
export function admitSend(state: FakeState, chat: Chat, options: { readonly rateLimited: boolean }): void {
  const denied = state.access.rejection(chat);
  if (denied !== undefined) throw denied;
  if (options.rateLimited && state.rateLimiter !== undefined) {
    const retryAfter = state.rateLimiter.admit(
      String(chat.id),
      chat.type === "private" ? "private" : "group",
      state.nowMs(),
    );
    if (retryAfter !== null) throw tooManyRequests(retryAfter);
  }
}

type Identity = { readonly messageId: number; readonly ephemeralMessageId?: number };

/** The `Message` the Bot API returns for something the bot sent. */
export function buildBotMessage(
  state: FakeState,
  chat: Chat,
  params: SendParams,
  content: OutboundContent,
  identity: Identity,
): Message {
  const replied =
    params.reply?.messageId === undefined ? undefined : state.messages.get(chat.id, params.reply.messageId);
  const markup =
    params.replyMarkup !== undefined && "inline_keyboard" in params.replyMarkup ? params.replyMarkup : undefined;

  const message: Message = {
    message_id: identity.messageId,
    date: state.nowSeconds(),
    chat,
    from: state.botUser,
    ...(params.threadId === undefined ? {} : { message_thread_id: params.threadId, is_topic_message: true }),
    ...(identity.ephemeralMessageId === undefined ? {} : { ephemeral_message_id: identity.ephemeralMessageId }),
    ...(params.effectId === undefined ? {} : { effect_id: params.effectId }),
    ...(replied === undefined ? {} : { reply_to_message: { ...replied.message, reply_to_message: undefined } }),
    ...(markup === undefined ? {} : { reply_markup: markup }),
  };

  switch (content.kind) {
    case "text":
      return {
        ...message,
        text: content.text.text,
        ...(content.text.entities.length === 0 ? {} : { entities: [...content.text.entities] }),
        ...(content.linkPreview === undefined ? {} : { link_preview_options: content.linkPreview }),
      };
    case "rich":
      return { ...message, rich_message: { blocks: [] } };
    case "document":
      return {
        ...message,
        document: content.document,
        ...(content.caption === undefined || content.caption.text === ""
          ? {}
          : { caption: content.caption.text }),
        ...(content.caption === undefined || content.caption.entities.length === 0
          ? {}
          : { caption_entities: [...content.caption.entities] }),
      };
  }
}

/**
 * Sends to a chat: checks access and flood control, ends the chat's drafts
 * ("the draft will disappear if the bot sends a message") and stores the message.
 */
export function deliverToChat(state: FakeState, params: SendParams, content: OutboundContent): Message {
  const chat = state.resolveChat(params.chat);
  if (params.ephemeral !== undefined) return deliverEphemeral(state, chat, params, content);

  admitSend(state, chat, { rateLimited: true });
  state.drafts.removeChat(chat.id);
  const message = buildBotMessage(state, chat, params, content, { messageId: state.messageIds.next(chat.id) });
  state.messages.add(message, true, content.kind === "rich" ? content.rich : undefined);
  return message;
}

/**
 * An ephemeral message: `message_id` is 0 and it is addressed by
 * `ephemeral_message_id`. The fake treats the bot as a non-administrator, so
 * it must answer a callback query or an ephemeral message within 15 seconds.
 * UNVERIFIED: description texts of the window errors.
 */
function deliverEphemeral(state: FakeState, chat: Chat, params: SendParams, content: OutboundContent): Message {
  const ephemeral = params.ephemeral;
  if (ephemeral === undefined) throw new Error("deliverEphemeral needs ephemeral parameters");
  admitSend(state, chat, { rateLimited: false });

  if (ephemeral.callbackQueryId !== undefined) {
    const query = state.queries.find("callback", ephemeral.callbackQueryId);
    if (query === undefined) throw badRequest(QUERY_TOO_OLD);
    if (state.nowMs() - query.deliveredAtMs > EPHEMERAL_WINDOW_MS) {
      throw badRequest("ephemeral messages can only be sent within 15 seconds of the user's action");
    }
  }
  const replyTo = params.reply?.ephemeralMessageId;
  if (replyTo !== undefined) {
    const inbound = state.ephemeral.get(chat.id, ephemeral.receiverUserId, replyTo);
    if (inbound === undefined) throw badRequest("ephemeral message to reply to not found");
    if (state.nowMs() - inbound.createdAtMs > EPHEMERAL_WINDOW_MS) {
      throw badRequest("an ephemeral message can only be replied to within 15 seconds");
    }
  }

  const ephemeralMessageId = state.ephemeral.nextId(chat.id);
  const message: Message = {
    ...buildBotMessage(state, chat, params, content, { messageId: 0, ephemeralMessageId }),
    receiver_user: { id: ephemeral.receiverUserId, is_bot: false, first_name: `User ${ephemeral.receiverUserId}` },
  };
  state.ephemeral.add({
    chatId: chat.id,
    receiverUserId: ephemeral.receiverUserId,
    ephemeralMessageId,
    message,
    createdAtMs: state.nowMs(),
  });
  return message;
}
