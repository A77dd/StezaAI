import { describe, expect, it } from "vitest";
import { isIdempotentMethod } from "./boundedRetry";

describe("isIdempotentMethod", () => {
  it.each([
    "getMe",
    "getFile",
    "setMessageReaction",
    "setMyCommands",
    "setWebhook",
    "editMessageText",
    "editMessageReplyMarkup",
    "deleteMessage",
    "answerCallbackQuery",
    "answerInlineQuery",
    "sendChatAction",
    "sendMessageDraft",
  ])("%s is safe to repeat", (method) => {
    expect(isIdempotentMethod(method)).toBe(true);
  });

  it.each(["sendMessage", "sendRichMessage", "sendDocument", "sendPhoto", "forwardMessage", "copyMessage", "sendPoll"])(
    "%s creates something and is not safe to repeat",
    (method) => {
      expect(isIdempotentMethod(method)).toBe(false);
    },
  );
});
