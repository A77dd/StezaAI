import { GET_FILE_MAX_BYTES } from "../state/fileRegistry";
import type { QueryKind } from "../state/queryStore";
import { readGetFile, readSendChatAction, readSetMessageReaction } from "../validation/interactions";
import { readSendMessageDraft } from "../validation/messages";
import { readAnswerCallbackQuery, readAnswerGuestQuery, readAnswerInlineQuery } from "../validation/queries";
import { badRequest, QUERY_TOO_OLD } from "../validation/rejection";
import type { FakeState } from "../state/fakeState";
import type { MethodHandler } from "./context";

function answerOnce(state: FakeState, kind: QueryKind, id: string): void {
  // An unknown or already answered query is "too old": each can be answered once.
  if (!state.queries.answer(kind, id)) throw badRequest(QUERY_TOO_OLD);
}

export const answerCallbackQuery: MethodHandler = ({ state }, payload) => {
  answerOnce(state, "callback", readAnswerCallbackQuery(payload).callbackQueryId);
  return true;
};

export const answerInlineQuery: MethodHandler = ({ state }, payload) => {
  answerOnce(state, "inline", readAnswerInlineQuery(payload).inlineQueryId);
  return true;
};

/** Answers once and returns the inline message the guest reply became, which the bot may edit. */
export const answerGuestQuery: MethodHandler = ({ state }, payload) => {
  const { guestQueryId } = readAnswerGuestQuery(payload);
  answerOnce(state, "guest", guestQueryId);
  const inlineMessageId = `guest-inline-${guestQueryId}`;
  state.queries.rememberInlineMessage(inlineMessageId);
  return { inline_message_id: inlineMessageId };
};

export const sendMessageDraft: MethodHandler = ({ state }, payload) => {
  const request = readSendMessageDraft(payload);
  const denied = state.access.rejection(state.chatById(request.chatId));
  if (denied !== undefined) throw denied;
  state.drafts.put({
    chatId: request.chatId,
    threadId: request.threadId,
    draftId: request.draftId,
    text: request.text.text,
    canStop: request.canStop,
    keepOnStop: request.keepOnStop,
    updatedAtMs: state.nowMs(),
  });
  return true;
};

export const sendChatAction: MethodHandler = ({ state }, payload) => {
  const request = readSendChatAction(payload);
  const denied = state.access.rejection(state.resolveChat(request.chat));
  if (denied !== undefined) throw denied;
  return true;
};

export const setMessageReaction: MethodHandler = ({ state }, payload) => {
  const request = readSetMessageReaction(payload);
  const chatId = state.numericChatId(request.chatId);
  // UNVERIFIED: the description for reacting to a message the fake does not know.
  if (chatId === undefined || state.messages.get(chatId, request.messageId) === undefined) {
    throw badRequest("message to react not found");
  }
  state.messages.setReaction(chatId, request.messageId, request.emoji);
  return true;
};

/**
 * `getFile`: known files only, at most 20 MB ("bots can download files of up to 20MB").
 * UNVERIFIED: the description texts for an unknown file and one that is too big.
 */
export const getFile: MethodHandler = ({ state }, payload) => {
  const entry = state.files.get(readGetFile(payload));
  if (entry === undefined) throw badRequest("invalid file_id");
  if ((entry.file_size ?? 0) > GET_FILE_MAX_BYTES) throw badRequest("file is too big");
  return state.files.toFile(entry);
};
