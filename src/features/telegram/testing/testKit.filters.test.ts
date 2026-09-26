import { Bot } from "grammy";
import { describe, expect, it } from "vitest";
import { BORIS, createSupergroupChat } from "./participants";
import { createTelegramTestKit } from "./testKit";

const TOKEN = "123456:fake-token";

function createBot(): Bot {
  return new Bot(TOKEN);
}

/** Records which handlers matched, to prove the builders produce updates grammY filters accept. */
function recordingBot(kit: ReturnType<typeof createTelegramTestKit>) {
  const bot = createBot();
  kit.attach(bot);
  const matched: string[] = [];
  const seen = (label: string) => () => {
    matched.push(label);
  };
  bot.on("message:forward_origin", seen("forward_origin"));
  bot.on("message:entities:mention", seen("mention"));
  bot.on("message:voice", seen("voice"));
  bot.on("message:web_app_data", seen("web_app_data"));
  bot.on("edited_message", seen("edited_message"));
  bot.on("callback_query:data", seen("callback_query:data"));
  bot.on("inline_query", seen("inline_query"));
  bot.on("chosen_inline_result", seen("chosen_inline_result"));
  bot.on("guest_message", seen("guest_message"));
  bot.on("my_chat_member", seen("my_chat_member"));
  bot.on("stopped_message_generation", seen("stopped_message_generation"));
  return { bot, matched };
}

describe("createTelegramTestKit: builders produce updates grammY filters match", () => {
  it("matches forward_origin for all four origins", async () => {
    const kit = createTelegramTestKit();
    const { bot, matched } = recordingBot(kit);
    const channel = { id: -1_002_000_000_000, type: "channel", title: "News" } as const;

    for (const source of [
      { kind: "user", user: BORIS },
      { kind: "hidden_user", name: "Hidden" },
      { kind: "chat", chat: createSupergroupChat() },
      { kind: "channel", chat: channel, messageId: 5 },
    ] as const) {
      await kit.deliver(bot, kit.updates.forwardedText("fwd", source));
    }

    expect(matched).toEqual(["forward_origin", "forward_origin", "forward_origin", "forward_origin"]);
  });

  it("matches callback_query:data for chat and inline messages", async () => {
    const kit = createTelegramTestKit();
    const { bot, matched } = recordingBot(kit);
    const message = kit.updates.privateText("x").message;
    if (message === undefined) throw new Error("no message");

    await kit.deliver(bot, kit.updates.callbackQuery(message, "d"));
    await kit.deliver(bot, kit.updates.inlineMessageCallbackQuery("inl-1", "d"));

    expect(matched).toEqual(["callback_query:data", "callback_query:data"]);
  });

  it("matches inline_query, chosen_inline_result, guest_message, my_chat_member, voice, edits, stops and web app data", async () => {
    const kit = createTelegramTestKit();
    const { bot, matched } = recordingBot(kit);

    await kit.deliver(bot, kit.updates.inlineQuery("free"));
    await kit.deliver(bot, kit.updates.chosenInlineResult("r", "free"));
    await kit.deliver(bot, kit.updates.guestMessage("@steza_test_bot hi", { chat: createSupergroupChat() }));
    await kit.deliver(bot, kit.updates.myChatMember("blocked"));
    await kit.deliver(bot, kit.updates.voice("f1", 3));
    await kit.deliver(bot, kit.updates.editedMessage("fixed", { messageId: 9 }));
    await kit.deliver(bot, kit.updates.messageGenerationStopped({ draftId: 1 }));
    await kit.deliver(bot, kit.updates.webAppData("{}", "Open"));

    expect(matched).toEqual([
      "inline_query",
      "chosen_inline_result",
      "guest_message",
      "my_chat_member",
      "voice",
      "edited_message",
      "stopped_message_generation",
      "web_app_data",
    ]);
  });

  it("detects mentions and commands for the attached bot username", async () => {
    const kit = createTelegramTestKit({ botUsername: "steza_test_bot" });
    const bot = createBot();
    kit.attach(bot);
    const seen: string[] = [];
    bot.command("start", (ctx) => {
      seen.push(`start:${ctx.match}`);
    });
    bot.command("plan", (ctx) => {
      seen.push(`plan:${ctx.match}`);
    });
    bot.on("message:entities:mention", (ctx) => {
      seen.push(`mention:${ctx.msg.text}`);
    });

    await kit.deliver(bot, kit.updates.command("start", "task_abc"));
    await kit.deliver(bot, kit.updates.groupCommand("plan", "friday"));
    await kit.deliver(bot, kit.updates.groupMention("🙂 @steza_test_bot запланируй"));
    await kit.deliver(bot, kit.updates.groupText("no mention here"));

    expect(seen).toEqual(["start:task_abc", "plan:friday", "mention:🙂 @steza_test_bot запланируй"]);
  });

  it("does not match a command addressed to another bot", async () => {
    const kit = createTelegramTestKit();
    const bot = createBot();
    kit.attach(bot);
    let called = false;
    bot.command("plan", () => {
      called = true;
    });

    await kit.deliver(bot, kit.updates.groupText("/plan@other_bot friday"));

    expect(called).toBe(false);
  });

  it("gives replies, quotes and topics the fields handlers read", async () => {
    const kit = createTelegramTestKit();
    const bot = createBot();
    kit.attach(bot);
    const seen: Array<string | number | undefined> = [];
    bot.on("message", (ctx) => {
      if (ctx.msg.reply_to_message !== undefined) seen.push(ctx.msg.reply_to_message.text, ctx.msg.quote?.text);
      if (ctx.msg.is_topic_message === true) seen.push(ctx.msg.message_thread_id);
    });
    const original = kit.updates.groupText("Созвонимся во вторник", { from: BORIS }).message;
    if (original === undefined) throw new Error("no message");

    await kit.deliver(bot, kit.updates.groupReply("@steza_test_bot", original, { quote: "во вторник" }));
    await kit.deliver(bot, kit.updates.topicMessage("hi", { threadId: 12 }));

    expect(seen).toEqual(["Созвонимся во вторник", "во вторник", 12]);
  });

  it("registers a voice file so the bot can call getFile", async () => {
    const kit = createTelegramTestKit();
    const bot = createBot();
    kit.attach(bot);
    let path: string | undefined;
    bot.on("message:voice", async (ctx) => {
      path = (await ctx.getFile()).file_path;
    });

    await kit.deliver(bot, kit.updates.voice("voice-1", 5, { fileSize: 2048 }));

    expect(path).toBe("voice/voice-1");
  });

  it("cuts the bot off after a block update", async () => {
    const kit = createTelegramTestKit();
    const bot = createBot();
    kit.attach(bot);
    bot.on("message:text", (ctx) => ctx.reply("hi"));

    await kit.deliver(bot, kit.updates.myChatMember("blocked"));
    const error: unknown = await kit.deliver(bot, kit.updates.privateText("hello")).catch((thrown: unknown) => thrown);

    expect(error).toMatchObject({ error: expect.objectContaining({ error_code: 403 }) });
  });
});
