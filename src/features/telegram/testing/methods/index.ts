import type { MethodHandler } from "./context";
import {
  deleteEphemeralMessage,
  deleteMessage,
  deleteMessages,
  editEphemeralMessageReplyMarkup,
  editEphemeralMessageText,
  editMessageReplyMarkup,
  editMessageText,
} from "./edit";
import {
  answerCallbackQuery,
  answerGuestQuery,
  answerInlineQuery,
  getFile,
  sendChatAction,
  sendMessageDraft,
  setMessageReaction,
} from "./interactive";
import { sendDocument, sendMessage, sendRichMessage } from "./send";
import {
  deleteMyCommands,
  deleteWebhook,
  getChatMenuButton,
  getMe,
  getMyCommands,
  getMyDefaultAdministratorRights,
  getMyDescription,
  getMyName,
  getMyShortDescription,
  getWebhookInfo,
  setChatMenuButton,
  setMyCommands,
  setMyDefaultAdministratorRights,
  setMyDescription,
  setMyName,
  setMyShortDescription,
  setWebhook,
} from "./settings";

/**
 * The Bot API methods the fake implements: everything the plan's tasks 6 to
 * 12 call. A call to any other method throws instead of answering, so a new
 * dependency on the Bot API is a visible decision to extend the fake.
 */
export const METHOD_HANDLERS: Readonly<Record<string, MethodHandler>> = {
  answerCallbackQuery,
  answerGuestQuery,
  answerInlineQuery,
  deleteEphemeralMessage,
  deleteMessage,
  deleteMessages,
  deleteMyCommands,
  deleteWebhook,
  editEphemeralMessageReplyMarkup,
  editEphemeralMessageText,
  editMessageReplyMarkup,
  editMessageText,
  getChatMenuButton,
  getFile,
  getMe,
  getMyCommands,
  getMyDefaultAdministratorRights,
  getMyDescription,
  getMyName,
  getMyShortDescription,
  getWebhookInfo,
  sendChatAction,
  sendDocument,
  sendMessage,
  sendMessageDraft,
  sendRichMessage,
  setChatMenuButton,
  setMessageReaction,
  setMyCommands,
  setMyDefaultAdministratorRights,
  setMyDescription,
  setMyName,
  setMyShortDescription,
  setWebhook,
};
