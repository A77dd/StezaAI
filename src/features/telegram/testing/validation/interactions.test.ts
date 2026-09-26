import { describe, expect, it } from "vitest";
import {
  ALLOWED_REACTION_EMOJI,
  readGetFile,
  readSendChatAction,
  readSetMessageReaction,
} from "./interactions";
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

describe("readSendChatAction", () => {
  it.each([
    "typing",
    "upload_photo",
    "record_video",
    "upload_video",
    "record_voice",
    "upload_voice",
    "upload_document",
    "choose_sticker",
    "find_location",
    "record_video_note",
    "upload_video_note",
  ])("accepts %s", (action) => {
    expect(readSendChatAction({ chat_id: 100, action })).toEqual({ chat: { kind: "private", id: 100 }, action });
  });

  it("rejects an unknown or missing action and a missing chat", () => {
    expect(rejection(() => readSendChatAction({ chat_id: 100, action: "dancing" })).description).toBe(
      "Bad Request: wrong parameter action in request",
    );
    expect(rejection(() => readSendChatAction({ chat_id: 100 })).errorCode).toBe(400);
    expect(rejection(() => readSendChatAction({ action: "typing" })).description).toBe("Bad Request: chat_id is empty");
  });

  it("validates the thread and rejects business connections", () => {
    expect(rejection(() => readSendChatAction({ chat_id: -100, action: "typing", message_thread_id: 0 })).errorCode).toBe(400);
    expect(rejection(() => readSendChatAction({ chat_id: 100, action: "typing", business_connection_id: "b" })).errorCode)
      .toBe(400);
  });
});

describe("readSetMessageReaction", () => {
  it("accepts one emoji reaction from the allowed set", () => {
    expect(readSetMessageReaction({ chat_id: 100, message_id: 3, reaction: [{ type: "emoji", emoji: "👍" }] })).toEqual({
      chatId: 100,
      messageId: 3,
      emoji: "👍",
    });
  });

  it("clears the reaction with an empty or missing list", () => {
    expect(readSetMessageReaction({ chat_id: 100, message_id: 3, reaction: [] }).emoji).toBeNull();
    expect(readSetMessageReaction({ chat_id: 100, message_id: 3 }).emoji).toBeNull();
  });

  it("knows the 73 emoji of the Bot API types, including the ones with joiners", () => {
    expect(ALLOWED_REACTION_EMOJI).toHaveLength(73);
    for (const emoji of ["👍", "❤", "❤‍🔥", "🤷‍♂", "👨‍💻", "🫡", "✍"]) {
      expect(ALLOWED_REACTION_EMOJI).toContain(emoji);
    }
  });

  it.each(["✅", "😀", "👍🏽", "", "x"])("rejects the emoji %j", (emoji) => {
    expect(
      rejection(() => readSetMessageReaction({ chat_id: 100, message_id: 3, reaction: [{ type: "emoji", emoji }] }))
        .description,
    ).toBe("Bad Request: REACTION_INVALID");
  });

  it("rejects custom emoji, paid reactions and unknown types", () => {
    for (const reaction of [
      { type: "custom_emoji", custom_emoji_id: "1" },
      { type: "paid" },
      { type: "star" },
      "👍",
    ]) {
      expect(rejection(() => readSetMessageReaction({ chat_id: 100, message_id: 3, reaction: [reaction] })).errorCode).toBe(
        400,
      );
    }
  });

  it("allows one reaction only", () => {
    expect(
      rejection(() =>
        readSetMessageReaction({
          chat_id: 100,
          message_id: 3,
          reaction: [
            { type: "emoji", emoji: "👍" },
            { type: "emoji", emoji: "🔥" },
          ],
        }),
      ).description,
    ).toBe("Bad Request: REACTIONS_TOO_MANY");
  });

  it("requires a message id and validates is_big", () => {
    expect(rejection(() => readSetMessageReaction({ chat_id: 100 })).description).toBe(
      "Bad Request: message identifier is not specified",
    );
    expect(rejection(() => readSetMessageReaction({ chat_id: 100, message_id: 3, is_big: "yes" })).errorCode).toBe(400);
    expect(rejection(() => readSetMessageReaction({ chat_id: 100, message_id: 3, reaction: "👍" })).errorCode).toBe(400);
  });
});

describe("readGetFile", () => {
  it("returns the file id", () => {
    expect(readGetFile({ file_id: "abc" })).toBe("abc");
  });

  it("requires a non-empty file id", () => {
    expect(rejection(() => readGetFile({})).description).toBe("Bad Request: invalid file_id");
    expect(rejection(() => readGetFile({ file_id: "" })).errorCode).toBe(400);
    expect(rejection(() => readGetFile({ file_id: 5 })).errorCode).toBe(400);
  });
});
