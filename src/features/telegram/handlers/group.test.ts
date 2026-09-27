import { describe, expect, it } from "vitest";
import { ALEX } from "@/features/telegram/testing/participants";
import { createPipelineHarness } from "@/features/telegram/testing/pipelineHarness";
import { expectCall, expectCallbackAnsweredOnce, expectRenderedText } from "@/features/telegram/testing/assertions";
import { registerPersonalFlow } from "@/features/telegram/handlers/personal";
import { registerGroupFlow } from "@/features/telegram/handlers/group";

const ALEX_ID = String(ALEX.id);
const GROUP_ID = -1001234567890;
const GROUP_THREAD_ID = 42;

/** Loose type for reading a message's keyboard in tests (avoids GameButton). */
type LooseKeyboard = { inline_keyboard?: { text?: string; callback_data?: string }[][] };

function chooserRows(message: { reply_markup?: LooseKeyboard }): string[][] {
  return (message.reply_markup?.inline_keyboard ?? []).map((row) =>
    row.map((b) => b.text ?? ""),
  );
}

function buttonData(message: { reply_markup?: LooseKeyboard }, rowIndex: number, buttonText: string): string {
  const row = message.reply_markup?.inline_keyboard?.[rowIndex];
  const button = row?.find((b) => b.text === buttonText);
  if (button?.callback_data === undefined) throw new Error(`button "${buttonText}" not found in row ${rowIndex}`);
  return button.callback_data;
}

function makeHarness() {
  return createPipelineHarness({
    composers: [registerPersonalFlow(), registerGroupFlow()],
  });
}

async function setupUser(h: ReturnType<typeof makeHarness>, userId: string, tz = "Europe/Moscow") {
  await h.services.personalFlow.startUser({ userId, locale: "ru" });
  await h.services.personalFlow.setTimezone({ userId, tz });
}

describe("group flow: mention and reply detection", () => {
  it("ignores group messages without mention or reply to bot", async () => {
    const h = makeHarness();
    await setupUser(h, ALEX_ID);

    // Regular group message - bot should not respond
    await h.deliver(h.kit.updates.groupText("Любое сообщение в группе", {
      from: ALEX,
      chat: { id: GROUP_ID, type: "supergroup", title: "Test Group" },
    }));

    // No sendMessage calls to the group
    expect(h.kit.fake.callsTo("sendMessage")).toHaveLength(0);
  });

  it("responds to @mention with bot username", async () => {
    const h = makeHarness();
    await setupUser(h, ALEX_ID);

    const update = h.kit.updates.groupMention("Привет @steza_test_bot, что по плану?", {
      from: ALEX,
      chat: { id: GROUP_ID, type: "supergroup", title: "Test Group" },
    });
    await h.deliver(update);

    // Should show group chooser in the group
    const sent = expectCall(h.kit, "sendMessage", { chat_id: GROUP_ID });
    expect(expectRenderedText(sent)).toContain("Что сделать?");
  });

  it("responds to reply to bot's message", async () => {
    const h = makeHarness();
    await setupUser(h, ALEX_ID);

    // First, the bot sends a message in the group (simulate previous
    // interaction): the sender must be the harness bot itself, because
    // `isReplyToBot` compares against `ctx.me.id`.
    const botMsg = h.kit.updates.groupText("Бот спросил что-то", {
      from: h.kit.botInfo,
      chat: { id: GROUP_ID, type: "supergroup", title: "Test Group" },
    });
    await h.deliver(botMsg);

    // User replies to that message
    await h.deliver(h.kit.updates.groupReply("Нужно подготовить отчёт", botMsg.message, {
      from: ALEX,
      chat: { id: GROUP_ID, type: "supergroup", title: "Test Group" },
    }));

    const sent = expectCall(h.kit, "sendMessage", { chat_id: GROUP_ID });
    expect(expectRenderedText(sent)).toContain("Что сделать?");
  });

  it("responds to text_mention (user without username)", async () => {
    const h = makeHarness();
    await setupUser(h, ALEX_ID);

    // A text_mention carries the mentioned user's full User object; the bot
    // is recognized by id (ADR 0002: `text_mention.user.id == bot.id`).
    const update = h.kit.updates.groupText("Привет, что по плану?", {
      from: ALEX,
      chat: { id: GROUP_ID, type: "supergroup", title: "Test Group" },
      entities: [{ type: "text_mention", offset: 7, length: 4, user: h.kit.botInfo }],
    });
    await h.deliver(update);

    const sent = expectCall(h.kit, "sendMessage", { chat_id: GROUP_ID });
    expect(expectRenderedText(sent)).toContain("Что сделать?");
  });

  it("shows group chooser with three options", async () => {
    const h = makeHarness();
    await setupUser(h, ALEX_ID);

    await h.deliver(h.kit.updates.groupMention("Задача @steza_test_bot", {
      from: ALEX,
      chat: { id: GROUP_ID, type: "supergroup", title: "Test Group" },
    }));

    const sent = expectCall(h.kit, "sendMessage", { chat_id: GROUP_ID });
    expect(expectRenderedText(sent)).toContain("Что сделать?");
    expect(chooserRows(sent.payload)).toEqual([
      ["Мне в календарь"],
      ["Зафиксировать для группы"],
      ["Просто запомнить"],
    ]);
  });
});

describe("group flow: context.choose callbacks", () => {
  it("personal choice sends private pointer in group", async () => {
    const h = makeHarness();
    await setupUser(h, ALEX_ID);

    // Trigger group chooser
    await h.deliver(h.kit.updates.groupMention("Задача @steza_test_bot", {
      from: ALEX,
      chat: { id: GROUP_ID, type: "supergroup", title: "Test Group" },
    }));

    const chooserMsg = h.kit.fake.messages.last(GROUP_ID)!.message;

    // Press "Мне в календарь" (a group callback query must carry the presser)
    const press = await h.kit.press(h.bot, chooserMsg, {
      data: buttonData(chooserMsg, 0, "Мне в календарь"),
      from: ALEX,
    });

    // In group: the chooser card is edited in place to the pointer (no new
    // message, never any calendar detail).
    const edited = expectCall(h.kit, "editMessageText", { chat_id: GROUP_ID, message_id: chooserMsg.message_id });
    expect(expectRenderedText(edited)).toContain("личных сообщениях");

    expectCallbackAnsweredOnce(h.kit, press.callback_query.id);
  });

  it("remember choice acknowledges in group without pointer", async () => {
    const h = makeHarness();
    await setupUser(h, ALEX_ID);

    await h.deliver(h.kit.updates.groupMention("Задача @steza_test_bot", {
      from: ALEX,
      chat: { id: GROUP_ID, type: "supergroup", title: "Test Group" },
    }));

    const chooserMsg = h.kit.fake.messages.last(GROUP_ID)!.message;

    const press = await h.kit.press(h.bot, chooserMsg, {
      data: buttonData(chooserMsg, 2, "Просто запомнить"),
      from: ALEX,
    });

    const edited = expectCall(h.kit, "editMessageText", { chat_id: GROUP_ID, message_id: chooserMsg.message_id });
    expect(expectRenderedText(edited)).toContain("Запомню");
    expect(expectRenderedText(edited)).not.toContain("личных сообщениях");

    expectCallbackAnsweredOnce(h.kit, press.callback_query.id);
  });
});

describe("group flow: thread support (message_thread_id)", () => {
  it("replies in the same topic when message_thread_id present", async () => {
    const h = makeHarness();
    await setupUser(h, ALEX_ID);

    const update = h.kit.updates.topicMessage("Задача @steza_test_bot", {
      from: ALEX,
      threadId: GROUP_THREAD_ID,
      chat: { id: GROUP_ID, type: "supergroup", title: "Test Group" },
    });
    await h.deliver(update);

    const sent = expectCall(h.kit, "sendMessage", { chat_id: GROUP_ID, message_thread_id: GROUP_THREAD_ID });
    expect(expectRenderedText(sent)).toContain("Что сделать?");
  });
});