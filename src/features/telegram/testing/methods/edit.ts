import type { Message } from "grammy/types";
import type { FakeState } from "../state/fakeState";
import { contentFingerprint } from "../state/messageStore";
import type { MessageRecord } from "../state/messageStore";
import type { EphemeralRecord } from "../state/ephemeralStore";
import {
  readDeleteEphemeralMessage,
  readEditEphemeralReplyMarkup,
  readEditEphemeralText,
} from "../validation/ephemeral";
import {
  readDeleteMessage,
  readDeleteMessages,
  readEditMessageReplyMarkup,
  readEditMessageText,
} from "../validation/messages";
import type { EditTarget, EditTextRequest } from "../validation/messages";
import { badRequest, messageNotModified } from "../validation/rejection";
import type { MethodContext, MethodHandler } from "./context";

/** "A message can only be deleted if it was sent less than 48 hours ago." */
const DELETE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

function requireBotMessage(state: FakeState, target: Extract<EditTarget, { kind: "chat" }>): MessageRecord {
  const chatId = state.numericChatId(target.chatId);
  const record = chatId === undefined ? undefined : state.messages.get(chatId, target.messageId);
  if (record === undefined) throw badRequest("message to edit not found");
  if (!record.sentByBot) throw badRequest("message can't be edited");
  return record;
}

type ContentKey = "text" | "entities" | "link_preview_options" | "rich_message" | "reply_markup";

function without(message: Message, ...keys: readonly ContentKey[]): Message {
  const copy: Message = { ...message };
  for (const key of keys) delete copy[key];
  return copy;
}

/** Editing replaces the content and the keyboard: nothing of the old ones is kept. */
function withoutContent(message: Message): Message {
  return without(message, "text", "entities", "link_preview_options", "rich_message", "reply_markup");
}

function editedMessage(state: FakeState, record: MessageRecord, request: EditTextRequest): Message {
  const base = { ...withoutContent(record.message), edit_date: state.nowSeconds() };
  const markup = request.markup === null ? {} : { reply_markup: request.markup };
  if (request.content.kind === "rich") return { ...base, rich_message: { blocks: [] }, ...markup };
  const { text, linkPreview } = request.content;
  return {
    ...base,
    text: text.text,
    ...(text.entities.length === 0 ? {} : { entities: [...text.entities] }),
    ...(linkPreview === undefined ? {} : { link_preview_options: linkPreview }),
    ...markup,
  };
}

function applyEdit(state: FakeState, record: MessageRecord, next: Message, rich: MessageRecord["rich"]): Message {
  // A message that ends up exactly as it was is rejected, not silently accepted.
  if (contentFingerprint(record.message, record.rich) === contentFingerprint(next, rich)) {
    throw messageNotModified();
  }
  state.messages.replace(record.chatId, record.messageId, next, rich);
  return next;
}

function requireInlineMessage(state: FakeState, inlineMessageId: string): void {
  // UNVERIFIED: the description for an unknown inline message id.
  if (!state.queries.knowsInlineMessage(inlineMessageId)) throw badRequest("MESSAGE_ID_INVALID");
}

/**
 * `editMessageText`: acts on a message the bot sent. A missing message is
 * "message to edit not found", a user's message "message can't be edited", a
 * message with no text (a document) "there is no text in the message to
 * edit", identical content and keyboard "message is not modified". Omitting
 * `reply_markup` removes the keyboard.
 * UNVERIFIED: identical edits of inline messages are not detected (their
 * initial content is unknown to the fake).
 */
export const editMessageText: MethodHandler = ({ state }, payload) => {
  const request = readEditMessageText(payload);
  if (request.target.kind === "inline") {
    requireInlineMessage(state, request.target.inlineMessageId);
    return true;
  }
  const record = requireBotMessage(state, request.target);
  if (record.message.text === undefined && record.rich === undefined) {
    throw badRequest("there is no text in the message to edit");
  }
  const rich = request.content.kind === "rich" ? request.content.rich : undefined;
  return applyEdit(state, record, editedMessage(state, record, request), rich);
};

export const editMessageReplyMarkup: MethodHandler = ({ state }, payload) => {
  const request = readEditMessageReplyMarkup(payload);
  if (request.target.kind === "inline") {
    requireInlineMessage(state, request.target.inlineMessageId);
    return true;
  }
  const record = requireBotMessage(state, request.target);
  const next: Message = {
    ...without(record.message, "reply_markup"),
    edit_date: state.nowSeconds(),
    ...(request.markup === null ? {} : { reply_markup: request.markup }),
  };
  return applyEdit(state, record, next, record.rich);
};

function assertDeletable(state: FakeState, record: MessageRecord): void {
  // Bots delete their own messages anywhere and users' messages in private chats only.
  if (!record.sentByBot && record.message.chat.type !== "private") {
    throw badRequest("message can't be deleted");
  }
  if (state.nowMs() - record.message.date * 1000 >= DELETE_MAX_AGE_MS) {
    throw badRequest("message can't be deleted");
  }
}

export const deleteMessage: MethodHandler = ({ state }, payload) => {
  const request = readDeleteMessage(payload);
  const chatId = state.numericChatId(request.chatId);
  const record = chatId === undefined ? undefined : state.messages.get(chatId, request.messageId);
  if (record === undefined) throw badRequest("message to delete not found");
  assertDeletable(state, record);
  state.messages.markDeleted(record.chatId, record.messageId);
  return true;
};

/**
 * `deleteMessages`: identifiers that do not exist are skipped ("missing ones
 * are skipped", research 5.6). UNVERIFIED: one message that cannot be deleted
 * fails the whole request and nothing is deleted.
 */
export const deleteMessages: MethodHandler = ({ state }, payload) => {
  const request = readDeleteMessages(payload);
  const chatId = state.numericChatId(request.chatId);
  const records =
    chatId === undefined
      ? []
      : request.messageIds.flatMap((id) => {
          const record = state.messages.get(chatId, id);
          return record === undefined ? [] : [record];
        });
  for (const record of records) assertDeletable(state, record);
  for (const record of records) state.messages.markDeleted(record.chatId, record.messageId);
  return true;
};

function requireEphemeral(context: MethodContext, ref: ReturnType<typeof readDeleteEphemeralMessage>): EphemeralRecord {
  const { state } = context;
  const chatId = state.numericChatId(ref.chatId);
  const record = chatId === undefined ? undefined : state.ephemeral.get(chatId, ref.receiverUserId, ref.ephemeralMessageId);
  // UNVERIFIED: description texts of the ephemeral edit and delete errors.
  if (record === undefined) throw badRequest("ephemeral message to edit not found");
  if (record.message.from?.id !== state.botUser.id) throw badRequest("message can't be edited");
  return record;
}

export const editEphemeralMessageText: MethodHandler = (context, payload) => {
  const request = readEditEphemeralText(payload);
  const record = requireEphemeral(context, request.ref);
  const base = { ...withoutContent(record.message), edit_date: context.state.nowSeconds() };
  const markup = request.markup === null ? {} : { reply_markup: request.markup };
  const next: Message =
    request.content.kind === "rich"
      ? { ...base, rich_message: { blocks: [] }, ...markup }
      : { ...base, text: request.content.text.text, ...markup };
  context.state.ephemeral.replaceMessage(record, next);
  return true;
};

export const editEphemeralMessageReplyMarkup: MethodHandler = (context, payload) => {
  const request = readEditEphemeralReplyMarkup(payload);
  const record = requireEphemeral(context, request.ref);
  context.state.ephemeral.replaceMessage(record, {
    ...without(record.message, "reply_markup"),
    ...(request.markup === null ? {} : { reply_markup: request.markup }),
  });
  return true;
};

export const deleteEphemeralMessage: MethodHandler = (context, payload) => {
  context.state.ephemeral.markDeleted(requireEphemeral(context, readDeleteEphemeralMessage(payload)));
  return true;
};
