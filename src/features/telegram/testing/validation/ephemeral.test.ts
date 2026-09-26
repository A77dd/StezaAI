import { describe, expect, it } from "vitest";
import {
  readDeleteEphemeralMessage,
  readEditEphemeralReplyMarkup,
  readEditEphemeralText,
} from "./ephemeral";
import { ApiRejection } from "./rejection";

function rejection(action: () => unknown): ApiRejection {
  try {
    action();
  } catch (error) {
    if (error instanceof ApiRejection) return error;
    throw error;
  }
  throw new Error("expected an ApiRejection");
}

const ref = { chat_id: -100, receiver_user_id: 42, ephemeral_message_id: 3 };
const keyboard = { inline_keyboard: [[{ text: "Go", callback_data: "a" }]] };

describe("ephemeral message references", () => {
  it("accepts a group chat, a receiver and an ephemeral message id", () => {
    expect(readDeleteEphemeralMessage(ref)).toEqual({ chatId: -100, receiverUserId: 42, ephemeralMessageId: 3 });
  });

  it("rejects private chats and missing parts", () => {
    expect(rejection(() => readDeleteEphemeralMessage({ ...ref, chat_id: 100 })).description).toMatch(/group/);
    expect(rejection(() => readDeleteEphemeralMessage({ ...ref, receiver_user_id: undefined })).errorCode).toBe(400);
    expect(rejection(() => readDeleteEphemeralMessage({ ...ref, ephemeral_message_id: undefined })).errorCode).toBe(400);
    expect(rejection(() => readDeleteEphemeralMessage({ ...ref, ephemeral_message_id: 0 })).errorCode).toBe(400);
  });
});

describe("readEditEphemeralText", () => {
  it("parses the new text like editMessageText", () => {
    const request = readEditEphemeralText({ ...ref, text: "<b>new</b>", parse_mode: "HTML", reply_markup: keyboard });
    expect(request.ref).toEqual({ chatId: -100, receiverUserId: 42, ephemeralMessageId: 3 });
    expect(request.content).toMatchObject({ kind: "text", text: { text: "new" } });
    expect(request.markup).toEqual(keyboard);
  });

  it("accepts a rich message and rejects both or neither", () => {
    expect(readEditEphemeralText({ ...ref, rich_message: { markdown: "x" } }).content.kind).toBe("rich");
    expect(rejection(() => readEditEphemeralText({ ...ref, text: "x", rich_message: { markdown: "x" } })).errorCode).toBe(400);
    expect(rejection(() => readEditEphemeralText({ ...ref })).description).toBe("Bad Request: message text is empty");
  });

  it("rejects a text over 4096 characters", () => {
    expect(rejection(() => readEditEphemeralText({ ...ref, text: "a".repeat(4097) })).description).toBe(
      "Bad Request: message is too long",
    );
  });

  it("does not support login_url in ephemeral keyboards", () => {
    const login = { inline_keyboard: [[{ text: "Login", login_url: { url: "https://example.com/l" } }]] };
    expect(rejection(() => readEditEphemeralText({ ...ref, text: "x", reply_markup: login })).description).toMatch(/ephemeral/);
  });
});

describe("readEditEphemeralReplyMarkup", () => {
  it("returns the reference and the keyboard", () => {
    expect(readEditEphemeralReplyMarkup({ ...ref, reply_markup: keyboard }).markup).toEqual(keyboard);
    expect(readEditEphemeralReplyMarkup({ ...ref }).markup).toBeNull();
  });
});
