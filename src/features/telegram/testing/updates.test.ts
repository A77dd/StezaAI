import type { Update } from "grammy/types";
import { describe, expect, it } from "vitest";
import { createMessageIdAllocator } from "./messageIds";
import { ALEX, BORIS, createGroupChat, createSupergroupChat } from "./participants";
import { createTestClock } from "./testClock";
import { createUpdateBuilder } from "./updates";

const BOT = "steza_test_bot";

function builder() {
  const clock = createTestClock("2026-09-23T09:00:00.000Z");
  return { updates: createUpdateBuilder({ botUsername: BOT, botId: 900_000_001, clock }), clock };
}

const NOW = Date.parse("2026-09-23T09:00:00.000Z") / 1000;

function updateFields(update: Update): string[] {
  return Object.keys(update).filter((key) => key !== "update_id");
}

describe("ids, dates and determinism", () => {
  it("increments update ids and message ids per chat", () => {
    const { updates } = builder();

    const first = updates.privateText("one");
    const second = updates.privateText("two");
    const other = updates.privateText("three", { from: BORIS });

    expect([first.update_id, second.update_id, other.update_id]).toEqual([100_000, 100_001, 100_002]);
    expect([first.message?.message_id, second.message?.message_id, other.message?.message_id]).toEqual([1, 2, 1]);
  });

  it("starts update ids where asked", () => {
    const updates = createUpdateBuilder({ botUsername: BOT, botId: 1, firstUpdateId: 5 });

    expect(updates.privateText("x").update_id).toBe(5);
  });

  it("dates messages from the clock unless a date is given", () => {
    const { updates, clock } = builder();

    expect(updates.privateText("a").message?.date).toBe(NOW);
    clock.advanceSeconds(60);
    expect(updates.privateText("b").message?.date).toBe(NOW + 60);
    expect(updates.privateText("c", { date: 1 }).message?.date).toBe(1);
  });

  it("produces identical updates for identical calls", () => {
    const run = () => {
      const { updates } = builder();
      return [updates.privateText("a"), updates.command("start", "ref"), updates.inlineQuery("q")];
    };

    expect(run()).toEqual(run());
  });

  it("shares message ids with an allocator so users and the bot never collide", () => {
    const messageIds = createMessageIdAllocator();
    const updates = createUpdateBuilder({ botUsername: BOT, botId: 1, messageIds });

    messageIds.next(ALEX.id);

    expect(updates.privateText("x").message?.message_id).toBe(2);
  });

  it("puts exactly one field besides update_id in every update", () => {
    const { updates } = builder();
    const group = createSupergroupChat();
    const message = updates.privateText("hi").message;
    if (message === undefined) throw new Error("no message");
    const all = [
      updates.privateText("a"),
      updates.command("start"),
      updates.forwardedText("f", { kind: "hidden_user", name: "Someone" }),
      updates.groupText("g", { chat: group }),
      updates.groupCommand("plan", undefined, { chat: group }),
      updates.inlineQuery("q"),
      updates.chosenInlineResult("r", "q"),
      updates.callbackQuery(message, "d"),
      updates.inlineMessageCallbackQuery("inl", "d"),
      updates.voice("f", 3),
      updates.editedMessage("e", { messageId: 1 }),
      updates.myChatMember("blocked"),
      updates.guestMessage("@steza_test_bot hi", { chat: group }),
      updates.messageGenerationStopped({ draftId: 1 }),
      updates.webAppData("{}", "Open"),
    ];

    for (const update of all) expect(updateFields(update)).toHaveLength(1);
  });
});

describe("private messages and commands", () => {
  it("builds a private text message with the sender's language", () => {
    const { updates } = builder();

    const message = updates.privateText("Нужно до пятницы", { languageCode: "en" }).message;

    expect(message).toMatchObject({
      text: "Нужно до пятницы",
      chat: { id: ALEX.id, type: "private", first_name: "Alex" },
      from: { id: ALEX.id, is_bot: false, language_code: "en" },
    });
    expect(message).not.toHaveProperty("entities");
  });

  it("builds a command with a bot_command entity and an optional deep link payload", () => {
    const { updates } = builder();

    expect(updates.command("start").message).toMatchObject({
      text: "/start",
      entities: [{ type: "bot_command", offset: 0, length: 6 }],
    });
    expect(updates.command("start", "task_abc-1").message).toMatchObject({
      text: "/start task_abc-1",
      entities: [{ type: "bot_command", offset: 0, length: 6 }],
    });
  });

  it("builds a group command addressed to the bot", () => {
    const { updates } = builder();
    const chat = createGroupChat();

    const message = updates.groupCommand("plan", "friday", { chat, from: BORIS }).message;

    expect(message).toMatchObject({
      text: "/plan@steza_test_bot friday",
      chat: { id: chat.id, type: "group" },
      from: { id: BORIS.id },
      entities: [{ type: "bot_command", offset: 0, length: 20 }],
    });
  });

  it("detects mentions of any user and commands in the middle of a text", () => {
    const { updates } = builder();

    const message = updates.privateText("ask @some_user then /help").message;

    expect(message?.entities).toEqual([
      { type: "mention", offset: 4, length: 10 },
      { type: "bot_command", offset: 20, length: 5 },
    ]);
  });

  it("uses explicit entities when given", () => {
    const { updates } = builder();

    const message = updates.privateText("plain @some_user", { entities: [] }).message;

    expect(message).not.toHaveProperty("entities");
  });
});

describe("forwarded messages", () => {
  it("builds a forward from a visible user", () => {
    const { updates } = builder();

    const message = updates.forwardedText("Обсудим бюджет?", { kind: "user", user: BORIS, date: 123 }).message;

    expect(message?.forward_origin).toEqual({ type: "user", sender_user: BORIS, date: 123 });
  });

  it("builds a forward from a hidden user, a chat and a channel", () => {
    const { updates } = builder();
    const supergroup = createSupergroupChat();
    const channel = { id: -1_002_000_000_000, type: "channel", title: "News" } as const;

    expect(updates.forwardedText("x", { kind: "hidden_user", name: "Hidden Person", date: 5 }).message?.forward_origin).toEqual({
      type: "hidden_user",
      sender_user_name: "Hidden Person",
      date: 5,
    });
    expect(updates.forwardedText("x", { kind: "chat", chat: supergroup, signature: "admin", date: 5 }).message?.forward_origin).toEqual({
      type: "chat",
      sender_chat: supergroup,
      author_signature: "admin",
      date: 5,
    });
    expect(updates.forwardedText("x", { kind: "channel", chat: channel, messageId: 77, date: 5 }).message?.forward_origin).toEqual({
      type: "channel",
      chat: channel,
      message_id: 77,
      date: 5,
    });
  });

  it("dates the original an hour before the forward by default", () => {
    const { updates } = builder();

    const origin = updates.forwardedText("x", { kind: "user", user: BORIS }).message?.forward_origin;

    expect(origin?.date).toBe(NOW - 3600);
  });
});

describe("group messages", () => {
  it("builds group and topic messages", () => {
    const { updates } = builder();
    const supergroup = createSupergroupChat({ is_forum: true });

    expect(updates.groupText("hi", { from: BORIS }).message).toMatchObject({
      chat: { type: "group" },
      from: { id: BORIS.id },
    });
    expect(updates.topicMessage("in topic", { chat: supergroup, threadId: 9 }).message).toMatchObject({
      chat: { id: supergroup.id, type: "supergroup", is_forum: true },
      message_thread_id: 9,
      is_topic_message: true,
    });
  });

  it("computes mention offsets in UTF-16 code units", () => {
    const { updates } = builder();

    const message = updates.groupMention("🙂 @steza_test_bot запланируй").message;

    // "🙂" and the space take three UTF-16 code units.
    expect(message?.entities).toEqual([{ type: "mention", offset: 3, length: 15 }]);
    expect(message?.text?.slice(3, 18)).toBe("@steza_test_bot");
  });

  it("refuses a group mention that does not mention the bot", () => {
    const { updates } = builder();

    expect(() => updates.groupMention("hello @someone_else")).toThrow(/does not mention @steza_test_bot/);
  });

  it("matches the bot username case-insensitively", () => {
    const { updates } = builder();

    expect(updates.groupMention("@Steza_Test_Bot hi").message?.entities).toHaveLength(1);
  });

  it("builds a reply with the replied message and no nested reply", () => {
    const { updates } = builder();
    const original = updates.groupText("Созвонимся во вторник?", { from: BORIS }).message;
    if (original === undefined) throw new Error("no message");

    const reply = updates.groupReply("@steza_test_bot запланируй", original, { from: ALEX }).message;

    expect(reply).toMatchObject({
      from: { id: ALEX.id },
      chat: { id: original.chat.id },
      reply_to_message: { message_id: original.message_id, text: "Созвонимся во вторник?", from: { id: BORIS.id } },
    });
    expect(reply?.reply_to_message?.reply_to_message).toBeUndefined();
    expect(reply?.entities).toEqual([{ type: "mention", offset: 0, length: 15 }]);
  });

  it("adds a quote at its position in the replied text", () => {
    const { updates } = builder();
    const original = updates.groupText("Созвонимся во вторник в 15:00", { from: BORIS }).message;
    if (original === undefined) throw new Error("no message");

    const reply = updates.groupReply("this", original, { quote: "во вторник" }).message;

    expect(reply?.quote).toEqual({ text: "во вторник", position: 11, is_manual: true });
  });

  it("refuses a quote that is not in the replied text", () => {
    const { updates } = builder();
    const original = updates.groupText("hello", { from: BORIS }).message;
    if (original === undefined) throw new Error("no message");

    expect(() => updates.groupReply("x", original, { quote: "goodbye" })).toThrow(/quote/);
  });
});

describe("voice, edits and web app data", () => {
  it("builds a voice message", () => {
    const { updates } = builder();

    const message = updates.voice("voice-file-1", 12, { mimeType: "audio/ogg", fileSize: 4096 }).message;

    expect(message?.voice).toEqual({
      file_id: "voice-file-1",
      file_unique_id: "unique-voice-file-1",
      duration: 12,
      mime_type: "audio/ogg",
      file_size: 4096,
    });
  });

  it("builds an edited message with an edit date after the original", () => {
    const { updates } = builder();

    const update = updates.editedMessage("fixed", { messageId: 4, editDate: NOW + 30 });

    expect(update.edited_message).toMatchObject({ message_id: 4, text: "fixed", edit_date: NOW + 30 });
    expect(update).not.toHaveProperty("message");
  });

  it("builds web app data", () => {
    const { updates } = builder();

    expect(updates.webAppData('{"a":1}', "Open").message?.web_app_data).toEqual({ data: '{"a":1}', button_text: "Open" });
  });
});
