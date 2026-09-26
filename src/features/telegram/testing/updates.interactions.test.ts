import { describe, expect, it } from "vitest";
import { ALEX, BORIS, createGroupChat, createSupergroupChat, privateChatOf } from "./participants";
import { createTestClock } from "./testClock";
import { createUpdateBuilder, fakeBotInfo } from "./updates";

const BOT = "steza_test_bot";

function builder() {
  const clock = createTestClock("2026-09-23T09:00:00.000Z");
  return { updates: createUpdateBuilder({ botUsername: BOT, botId: 900_000_001, clock }), clock };
}

const NOW = Date.parse("2026-09-23T09:00:00.000Z") / 1000;

describe("inline mode", () => {
  it("builds an inline query and a chosen result", () => {
    const { updates } = builder();

    expect(updates.inlineQuery("свободное время сегодня", { offset: "10", chatType: "supergroup" }).inline_query).toEqual({
      id: "inline-1",
      from: ALEX,
      query: "свободное время сегодня",
      offset: "10",
      chat_type: "supergroup",
    });
    expect(updates.chosenInlineResult("slot-1", "free", { inlineMessageId: "inl-9" }).chosen_inline_result).toEqual({
      result_id: "slot-1",
      from: ALEX,
      query: "free",
      inline_message_id: "inl-9",
    });
  });
});

describe("callback queries", () => {
  it("builds a callback query from a message of the bot", () => {
    const { updates } = builder();
    const message = {
      message_id: 3,
      date: NOW,
      chat: privateChatOf(ALEX),
      from: { id: 900_000_001, is_bot: true as const, first_name: "Fake bot", username: BOT },
      text: "card",
    };

    const query = updates.callbackQuery(message, "v1:slot.pick:abc").callback_query;

    expect(query).toEqual({
      id: "callback-1",
      chat_instance: `chat-instance-${ALEX.id}`,
      from: expect.objectContaining({ id: ALEX.id }),
      message,
      data: "v1:slot.pick:abc",
    });
  });

  it("needs the presser for a group message and takes it from options", () => {
    const { updates } = builder();
    const chat = createGroupChat();
    const message = { message_id: 3, date: NOW, chat, text: "choose" };

    expect(() => updates.callbackQuery(message, "d")).toThrow(/from/);
    expect(updates.callbackQuery(message, "d", { from: BORIS }).callback_query?.from.id).toBe(BORIS.id);
  });

  it("rejects callback data over 64 bytes, which no real button can carry", () => {
    const { updates } = builder();
    const message = { message_id: 3, date: NOW, chat: privateChatOf(ALEX), text: "x" };

    expect(updates.callbackQuery(message, "я".repeat(32))).toBeDefined();
    expect(() => updates.callbackQuery(message, "я".repeat(33))).toThrow(RangeError);
    expect(() => updates.callbackQuery(message, "")).toThrow(RangeError);
  });

  it("builds a callback query from an inline message", () => {
    const { updates } = builder();

    const query = updates.inlineMessageCallbackQuery("inl-1", "d").callback_query;

    expect(query).toMatchObject({ inline_message_id: "inl-1", data: "d", from: { id: ALEX.id } });
    expect(query).not.toHaveProperty("message");
  });
});

describe("membership and generation updates", () => {
  const botMember = (status: string) => expect.objectContaining({ status, user: expect.objectContaining({ id: 900_000_001 }) });

  it("builds a block and an unblock in a private chat", () => {
    const { updates } = builder();

    expect(updates.myChatMember("blocked").my_chat_member).toMatchObject({
      chat: { id: ALEX.id, type: "private" },
      from: { id: ALEX.id },
      old_chat_member: botMember("member"),
      new_chat_member: { status: "kicked", until_date: 0 },
    });
    expect(updates.myChatMember("unblocked").my_chat_member).toMatchObject({
      old_chat_member: botMember("kicked"),
      new_chat_member: botMember("member"),
    });
  });

  it("builds group transitions", () => {
    const { updates } = builder();
    const chat = createGroupChat();

    expect(updates.myChatMember("added", { chat }).my_chat_member).toMatchObject({
      old_chat_member: botMember("left"),
      new_chat_member: botMember("member"),
    });
    expect(updates.myChatMember("removed", { chat }).my_chat_member?.new_chat_member.status).toBe("kicked");
    expect(updates.myChatMember("left", { chat }).my_chat_member?.new_chat_member.status).toBe("left");
  });

  it("refuses transitions Telegram never reports for that chat type", () => {
    const { updates } = builder();
    const chat = createGroupChat();

    expect(() => updates.myChatMember("added")).toThrow(/private chat/);
    expect(() => updates.myChatMember("blocked", { chat })).toThrow(/group/);
  });

  it("builds a guest message with a query id and the bot mention", () => {
    const { updates } = builder();
    const chat = createSupergroupChat();

    const message = updates.guestMessage("@steza_test_bot найди время", { chat, guestQueryId: "gq-7" }).guest_message;

    expect(message).toMatchObject({
      guest_query_id: "gq-7",
      chat: { id: chat.id },
      from: { id: ALEX.id },
      entities: [{ type: "mention", offset: 0, length: 15 }],
    });
  });

  it("builds a stopped generation update for a private chat", () => {
    const { updates } = builder();

    expect(updates.messageGenerationStopped({ draftId: 4, threadId: 2 }).stopped_message_generation).toEqual({
      chat: privateChatOf(ALEX),
      draft_id: 4,
      message_thread_id: 2,
    });
  });
});

describe("fakeBotInfo", () => {
  it("describes a bot that can be preset as botInfo", () => {
    expect(fakeBotInfo(BOT)).toMatchObject({ username: BOT, is_bot: true, can_join_groups: true, supports_inline_queries: true });
    expect(fakeBotInfo(BOT, 5).id).toBe(5);
  });
});
