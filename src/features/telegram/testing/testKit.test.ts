import { autoRetry } from "@grammyjs/auto-retry";
import { Bot, GrammyError, InlineKeyboard } from "grammy";
import type { Message } from "grammy/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFailures } from "./fakeBotApi";
import { ALEX, createGroupChat } from "./participants";
import { createTelegramTestKit } from "./testKit";
import type { BotLike } from "./testKit";

const TOKEN = "123456:fake-token";

function createBot(): Bot {
  return new Bot(TOKEN);
}

describe("createTelegramTestKit: attach and deliver", () => {
  it("presets botInfo so no getMe call is made and routes API calls to the fake", async () => {
    const kit = createTelegramTestKit();
    const bot = createBot();
    kit.attach(bot);
    bot.on("message:text", (ctx) => ctx.reply(`hi ${ctx.me.username}`));

    await kit.deliver(bot, kit.updates.privateText("hello"));

    expect(kit.fake.callsTo("getMe")).toHaveLength(0);
    expect(kit.fake.lastCall("sendMessage")?.payload).toMatchObject({ chat_id: ALEX.id, text: "hi steza_test_bot" });
  });

  it("registers the delivered message so the bot can reply to and delete it", async () => {
    const kit = createTelegramTestKit();
    const bot = createBot();
    kit.attach(bot);
    bot.on("message:text", async (ctx) => {
      await ctx.reply("got it", { reply_parameters: { message_id: ctx.msg.message_id } });
      await ctx.deleteMessage();
    });

    await kit.deliver(bot, kit.updates.privateText("hello"));

    expect(kit.fake.messages.deleted(ALEX.id)).toHaveLength(1);
    expect(kit.fake.messages.sentByBot(ALEX.id)[0]?.message.reply_to_message?.text).toBe("hello");
  });

  it("uses one message id sequence for user and bot messages of a chat", async () => {
    const kit = createTelegramTestKit();
    const bot = createBot();
    kit.attach(bot);
    bot.on("message:text", (ctx) => ctx.reply("echo"));

    await kit.deliver(bot, kit.updates.privateText("one"));
    await kit.deliver(bot, kit.updates.privateText("two"));

    expect(kit.fake.messages.list(ALEX.id).map((record) => [record.messageId, record.sentByBot])).toEqual([
      [1, false],
      [2, true],
      [3, false],
      [4, true],
    ]);
  });

  it("surfaces a rejected Bot API call as the handler error", async () => {
    const kit = createTelegramTestKit();
    const bot = createBot();
    kit.attach(bot);
    bot.on("message:text", (ctx) => ctx.reply("x".repeat(4097)));

    const error: unknown = await kit.deliver(bot, kit.updates.privateText("hi")).catch((thrown: unknown) => thrown);

    expect(error).toMatchObject({ error: expect.any(GrammyError) });
  });

  it("accepts any bot that has the minimal shape", async () => {
    const kit = createTelegramTestKit();
    const seen: string[] = [];
    const used: unknown[] = [];
    const fakeBot: BotLike = {
      api: { config: { use: (...transformers) => used.push(...transformers), installedTransformers: () => [] } },
      botInfo: kit.botInfo,
      handleUpdate: (update) => {
        seen.push(String(update.update_id));
        return Promise.resolve();
      },
    };

    kit.attach(fakeBot);
    await kit.deliver(fakeBot, kit.updates.privateText("x"));

    expect(used).toEqual([kit.fake.transformer]);
    expect(seen).toEqual(["100000"]);
  });
});

describe("createTelegramTestKit: plugins that wrap the fake", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses a bot that already has transformers, which the fake would bypass", () => {
    const kit = createTelegramTestKit();
    const bot = createBot();
    bot.api.config.use(autoRetry());

    expect(() => kit.attach(bot)).toThrow(/already has API transformers/);
  });

  it("lets auto-retry, installed after the fake, retry a 429 with retry_after", async () => {
    const kit = createTelegramTestKit();
    const bot = kit.attach(createBot());
    bot.api.config.use(autoRetry({ maxRetryAttempts: 2 }));
    bot.on("message:text", (ctx) => ctx.reply("hi"));
    kit.fake.failNext("sendMessage", { error_code: 429, retry_after: 0 });

    await kit.deliver(bot, kit.updates.privateText("hello"));

    expect(kit.fake.callsTo("sendMessage").map((call) => call.outcome.kind)).toEqual(["error", "ok"]);
  });

  it("shows why retrying after a lost response duplicates a message (deliver then drop)", async () => {
    vi.useFakeTimers();
    const kit = createTelegramTestKit();
    const bot = kit.attach(createBot());
    bot.api.config.use(autoRetry({ maxRetryAttempts: 2 }));
    bot.on("message:text", (ctx) => ctx.reply("hi"));
    kit.fake.failNext("sendMessage", fakeFailures.networkErrorAfterDelivery());

    const delivered = kit.deliver(bot, kit.updates.privateText("hello"));
    await vi.advanceTimersByTimeAsync(3000);
    await delivered;

    expect(kit.fake.messages.sentByBot(ALEX.id).map((record) => record.message.text)).toEqual(["hi", "hi"]);
  });
});

describe("createTelegramTestKit: echo bot end to end", () => {
  function echoBot() {
    const kit = createTelegramTestKit();
    const bot = createBot();
    kit.attach(bot);
    bot.on("message:text", (ctx) =>
      ctx.reply(`<b>Echo</b>: ${ctx.msg.text}`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("Confirm", "v1:confirm:1"),
      }),
    );
    bot.callbackQuery("v1:confirm:1", async (ctx) => {
      await ctx.answerCallbackQuery({ text: "Done" });
      await ctx.editMessageText("<b>Confirmed</b>", { parse_mode: "HTML" });
    });
    return { kit, bot };
  }

  it("replies with an inline keyboard, handles the press, answers once and edits in place", async () => {
    const { kit, bot } = echoBot();
    await kit.deliver(bot, kit.updates.privateText("plan"));
    const card = kit.fake.messages.last(ALEX.id)?.message;
    if (card === undefined) throw new Error("no reply");

    const pressed = await kit.press(bot, card, { text: "Confirm" });

    const queryId = pressed.callback_query.id;
    expect(kit.fake.answeredCallbackIds).toEqual([queryId]);
    expect(kit.fake.callsTo("answerCallbackQuery")).toHaveLength(1);
    expect(kit.fake.messages.get(ALEX.id, card.message_id)?.message).toMatchObject({ text: "Confirmed", entities: [{ type: "bold", offset: 0, length: 9 }] });
    expect(kit.fake.messages.get(ALEX.id, card.message_id)?.message.reply_markup).toBeUndefined();
  });

  it("rejects pressing a button the message does not have", async () => {
    const { kit, bot } = echoBot();
    await kit.deliver(bot, kit.updates.privateText("plan"));
    const card = kit.fake.messages.last(ALEX.id)?.message;
    if (card === undefined) throw new Error("no reply");

    await expect(kit.press(bot, card, { text: "Nope" })).rejects.toThrow(/no callback button "Nope".*Confirm/s);
    await expect(kit.press(bot, card, { data: "v1:other" })).rejects.toThrow(/no callback button/);
  });

  it("presses by callback data and needs a presser in groups", async () => {
    const { kit, bot } = echoBot();
    await kit.deliver(bot, kit.updates.privateText("plan"));
    const card = kit.fake.messages.last(ALEX.id)?.message;
    if (card === undefined) throw new Error("no reply");
    const inGroup: Message = { ...card, chat: createGroupChat() };

    await kit.press(bot, card, { data: "v1:confirm:1" });
    await expect(kit.press(bot, inGroup, { data: "v1:confirm:1" })).rejects.toThrow(/options\.from/);
  });

  it("fails a second press of the same card the way Telegram would: the button was already handled", async () => {
    const { kit, bot } = echoBot();
    await kit.deliver(bot, kit.updates.privateText("plan"));
    const card = kit.fake.messages.last(ALEX.id)?.message;
    if (card === undefined) throw new Error("no reply");
    await kit.press(bot, card, { text: "Confirm" });

    // The keyboard was removed by the edit, but a stale client can still press it.
    const stale = await kit.press(bot, card, { text: "Confirm" }).catch((thrown: unknown) => thrown);

    expect(stale).toMatchObject({ error: expect.objectContaining({ description: expect.stringMatching(/message is not modified/) }) });
  });
});

describe("createTelegramTestKit: determinism", () => {
  async function scenario(): Promise<string> {
    const kit = createTelegramTestKit();
    const bot = createBot();
    kit.attach(bot);
    bot.on("message:text", async (ctx) => {
      await ctx.reply("one");
      kit.clock.advanceSeconds(3);
      await ctx.reply("two", { reply_markup: new InlineKeyboard().text("Go", "d") });
    });
    await kit.deliver(bot, kit.updates.privateText("start"));
    await kit.deliver(bot, kit.updates.groupText("ignored"));
    return JSON.stringify(kit.fake.calls);
  }

  it("produces identical calls, ids and dates on every run", async () => {
    expect(await scenario()).toBe(await scenario());
  });
});

describe("createTelegramTestKit: reset", () => {
  it("clears calls and state", async () => {
    const kit = createTelegramTestKit();
    const bot = createBot();
    kit.attach(bot);
    bot.on("message:text", (ctx) => ctx.reply("x"));
    await kit.deliver(bot, kit.updates.privateText("a"));

    kit.reset();

    expect(kit.fake.calls).toHaveLength(0);
    expect(kit.fake.messages.list()).toHaveLength(0);
  });
});
