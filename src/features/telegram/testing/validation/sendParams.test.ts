import { describe, expect, it } from "vitest";
import { ApiRejection } from "./rejection";
import { readSendParams } from "./sendParams";
import type { MessageLookup } from "./sendParams";

function rejection(action: () => unknown): ApiRejection {
  try {
    action();
  } catch (error) {
    if (error instanceof ApiRejection) return error;
    throw error;
  }
  throw new Error("expected an ApiRejection");
}

const known: MessageLookup = (chatId, messageId) =>
  chatId === 100 && messageId === 7 ? { text: "the original message" } : undefined;

function read(payload: Record<string, unknown>, lookup: MessageLookup = known) {
  return readSendParams(payload, lookup);
}

describe("readSendParams: chat", () => {
  it("requires chat_id", () => {
    expect(rejection(() => read({}))).toMatchObject({
      errorCode: 400,
      description: "Bad Request: chat_id is empty",
    });
  });

  it.each([0, 1.5, "abc", "@ab", true, null])("rejects chat_id %j", (chatId) => {
    expect(rejection(() => read({ chat_id: chatId })).errorCode).toBe(400);
  });

  it("accepts a user id, a group id and a public @username", () => {
    expect(read({ chat_id: 100 }).chat).toEqual({ kind: "private", id: 100 });
    expect(read({ chat_id: -100 }).chat).toEqual({ kind: "group", id: -100 });
    expect(read({ chat_id: "@some_channel" }).chat).toEqual({ kind: "public", id: "@some_channel" });
  });

  it("validates message_thread_id and the boolean flags", () => {
    expect(read({ chat_id: -100, message_thread_id: 5 }).threadId).toBe(5);
    expect(rejection(() => read({ chat_id: -100, message_thread_id: 0 })).errorCode).toBe(400);
    expect(rejection(() => read({ chat_id: 100, disable_notification: "yes" })).errorCode).toBe(400);
    expect(rejection(() => read({ chat_id: 100, protect_content: 1 })).errorCode).toBe(400);
  });

  it("rejects features the fake does not model", () => {
    for (const key of ["business_connection_id", "direct_messages_topic_id", "suggested_post_parameters"]) {
      expect(rejection(() => read({ chat_id: 100, [key]: "x" })).description).toMatch(/does not model/);
    }
  });
});

describe("readSendParams: message_effect_id", () => {
  it("is accepted in private chats only", () => {
    expect(read({ chat_id: 100, message_effect_id: "5104841245755180586" }).effectId).toBe("5104841245755180586");
    expect(rejection(() => read({ chat_id: -100, message_effect_id: "x" })).description).toMatch(/private chats/);
    expect(rejection(() => read({ chat_id: "@channel_name", message_effect_id: "x" })).errorCode).toBe(400);
    expect(rejection(() => read({ chat_id: 100, message_effect_id: "" })).errorCode).toBe(400);
  });
});

describe("readSendParams: reply_parameters", () => {
  it("accepts a reply to a known message", () => {
    expect(read({ chat_id: 100, reply_parameters: { message_id: 7 } }).reply).toEqual({
      chatId: 100,
      messageId: 7,
    });
  });

  it("rejects a reply to an unknown message unless sending without reply is allowed", () => {
    expect(rejection(() => read({ chat_id: 100, reply_parameters: { message_id: 8 } }))).toMatchObject({
      errorCode: 400,
      description: "Bad Request: message to be replied not found",
    });
    expect(read({ chat_id: 100, reply_parameters: { message_id: 8, allow_sending_without_reply: true } }).reply)
      .toEqual({ chatId: 100, messageId: 8 });
  });

  it("does not check replies to another chat", () => {
    expect(read({ chat_id: 100, reply_parameters: { message_id: 8, chat_id: 555 } }).reply).toEqual({
      chatId: 555,
      messageId: 8,
    });
  });

  it("requires a message id or an ephemeral message id", () => {
    expect(rejection(() => read({ chat_id: 100, reply_parameters: {} })).description).toBe(
      "Bad Request: message identifier is not specified",
    );
    expect(rejection(() => read({ chat_id: 100, reply_parameters: { message_id: 0 } })).errorCode).toBe(400);
  });

  it("requires a quote to be an exact substring of the replied message", () => {
    expect(read({ chat_id: 100, reply_parameters: { message_id: 7, quote: "original" } }).reply).toBeDefined();
    expect(
      rejection(() => read({ chat_id: 100, reply_parameters: { message_id: 7, quote: "something else" } })),
    ).toMatchObject({ errorCode: 400 });
  });

  it("limits a quote to 1024 characters and parses its markup", () => {
    expect(
      rejection(() => read({ chat_id: 100, reply_parameters: { message_id: 7, quote: "x".repeat(1025) } })).errorCode,
    ).toBe(400);
    expect(
      read({
        chat_id: 100,
        reply_parameters: { message_id: 7, quote: "<b>original</b>", quote_parse_mode: "HTML" },
      }).reply,
    ).toBeDefined();
  });

  it("accepts the deprecated reply_to_message_id", () => {
    expect(read({ chat_id: 100, reply_to_message_id: 7 }).reply).toEqual({ chatId: 100, messageId: 7 });
  });

  it("requires a reply to an ephemeral message to be ephemeral itself", () => {
    expect(rejection(() => read({ chat_id: -100, reply_parameters: { ephemeral_message_id: 3 } })).description)
      .toMatch(/ephemeral/);
    expect(
      read({
        chat_id: -100,
        reply_parameters: { ephemeral_message_id: 3 },
        ephemeral_message_parameters: { receiver_user_id: 42 },
      }).reply,
    ).toEqual({ chatId: -100, ephemeralMessageId: 3 });
  });
});

describe("readSendParams: ephemeral_message_parameters", () => {
  it("accepts a receiver in a group chat with the triggering callback query", () => {
    expect(
      read({
        chat_id: -100,
        ephemeral_message_parameters: { receiver_user_id: 42, callback_query_id: "cbq-1", replace_callback_query_message: true },
      }).ephemeral,
    ).toEqual({ receiverUserId: 42, callbackQueryId: "cbq-1", replaceCallbackQueryMessage: true });
  });

  it("is not available in private chats", () => {
    expect(
      rejection(() => read({ chat_id: 100, ephemeral_message_parameters: { receiver_user_id: 100 } })).description,
    ).toMatch(/group/);
  });

  it("needs a receiver and a callback query or an ephemeral reply", () => {
    expect(rejection(() => read({ chat_id: -100, ephemeral_message_parameters: {} })).errorCode).toBe(400);
    expect(
      rejection(() => read({ chat_id: -100, ephemeral_message_parameters: { receiver_user_id: 42 } })).description,
    ).toMatch(/callback_query_id/);
  });

  it("allows only inline keyboards", () => {
    expect(
      rejection(() =>
        read({
          chat_id: -100,
          ephemeral_message_parameters: { receiver_user_id: 42, callback_query_id: "c" },
          reply_markup: { remove_keyboard: true },
        }),
      ).description,
    ).toMatch(/inline keyboard/);
  });
});

describe("readSendParams: reply_markup", () => {
  it("validates the keyboard against the chat kind", () => {
    const web = { inline_keyboard: [[{ text: "Open", web_app: { url: "https://app.example.com" } }]] };
    expect(read({ chat_id: 100, reply_markup: web }).replyMarkup).toEqual(web);
    expect(rejection(() => read({ chat_id: -100, reply_markup: web })).description).toMatch(/private chats/);
  });

  it("returns no markup when none was given", () => {
    expect(read({ chat_id: 100 }).replyMarkup).toBeUndefined();
  });
});
