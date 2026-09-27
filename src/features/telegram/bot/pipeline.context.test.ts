import { Composer } from "grammy";
import { describe, expect, it } from "vitest";
import { createDefaultSettings } from "../domain";
import type { UserSettings } from "../domain";
import { ALEX, createGroupChat } from "../testing/participants";
import { TEST_BOT_TOKEN, createPipelineHarness } from "../testing/pipelineHarness";
import type { BotContext } from "./context";

type Seen = {
  locale: string;
  chatContext: string;
  timezone: string;
  settings: UserSettings | null;
};

function recordingComposer(seen: Seen[]): Composer<BotContext> {
  const composer = new Composer<BotContext>();
  composer.use(async (ctx, next) => {
    const settings = await ctx.loadSettings();
    seen.push({
      locale: ctx.locale,
      chatContext: ctx.chatContext,
      timezone: ctx.viewContext(settings).timezone,
      settings,
    });
    await next();
  });
  return composer;
}

describe("pipeline: context enrichment", () => {
  it("answers in Russian whatever the client's language_code is (Russian-only pilot)", async () => {
    const seen: Seen[] = [];
    const h = createPipelineHarness({ composers: [recordingComposer(seen)] });

    await h.deliver(h.kit.updates.privateText("a", { from: { ...ALEX, language_code: "en-GB" } }));
    await h.deliver(h.kit.updates.privateText("b", { from: { ...ALEX, language_code: "de" } }));
    await h.deliver(h.kit.updates.privateText("c", { from: { ...ALEX, language_code: undefined } }));

    expect(seen.map((entry) => entry.locale)).toEqual(["ru", "ru", "ru"]);
  });

  it("keeps Russian even when the stored settings say en (Russian-only pilot)", async () => {
    const seen: Seen[] = [];
    const h = createPipelineHarness({ composers: [recordingComposer(seen)] });
    await h.services.settings.upsert({
      ...createDefaultSettings(String(ALEX.id), "en"),
      timezone: "Europe/Moscow",
    });

    await h.deliver(h.kit.updates.privateText("привет", { from: { ...ALEX, language_code: "ru" } }));

    expect(seen[0]).toMatchObject({ locale: "ru", timezone: "Europe/Moscow" });
    expect(seen[0]?.settings?.locale).toBe("en");
  });

  it("uses the default timezone (UTC) without stored settings", async () => {
    const seen: Seen[] = [];
    const h = createPipelineHarness({ composers: [recordingComposer(seen)] });

    await h.deliver(h.kit.updates.privateText("hi"));

    expect(seen[0]).toMatchObject({ timezone: "UTC", settings: null });
  });

  it("sets PERSONAL for a private chat and CHAT for a group", async () => {
    const seen: Seen[] = [];
    const h = createPipelineHarness({ composers: [recordingComposer(seen)] });

    await h.deliver(h.kit.updates.privateText("hi"));
    await h.deliver(h.kit.updates.groupMention("@steza_test_bot hi", { chat: createGroupChat() }));

    expect(seen.map((entry) => entry.chatContext)).toEqual(["PERSONAL", "CHAT"]);
  });

  it("treats an inline query typed in a group as CHAT and one in the own chat as PERSONAL", async () => {
    const seen: Seen[] = [];
    const h = createPipelineHarness({ composers: [recordingComposer(seen)] });

    await h.deliver(h.kit.updates.inlineQuery("q", { chatType: "supergroup" }));
    await h.deliver(h.kit.updates.inlineQuery("q", { chatType: "sender" }));

    expect(seen.map((entry) => entry.chatContext)).toEqual(["CHAT", "PERSONAL"]);
  });

  it("reads the stored settings once per update", async () => {
    let reads = 0;
    const composer = new Composer<BotContext>();
    composer.use(async (ctx, next) => {
      await ctx.loadSettings();
      await ctx.loadSettings();
      await next();
    });
    const h = createPipelineHarness({ composers: [composer] });
    const original = h.services.settings.get.bind(h.services.settings);
    h.services.settings.get = async (userId) => {
      reads += 1;
      return original(userId);
    };

    await h.deliver(h.kit.updates.privateText("hi"));

    // enrichContext reads once; later calls in the same update reuse it.
    expect(reads).toBe(1);
  });

  it("returns null settings for an update without a user", async () => {
    const seen: Seen[] = [];
    const h = createPipelineHarness({ composers: [recordingComposer(seen)] });

    await h.deliver({ update_id: 5, poll: { id: "1" } } as never);

    expect(seen[0]?.settings).toBeNull();
  });
});

describe("pipeline: logging", () => {
  it("writes one update.processed record with duration from the injected clock", async () => {
    const composer = new Composer<BotContext>();
    composer.on("message:text", () => {
      h.kit.clock.advanceMs(250);
    });
    const h = createPipelineHarness({ composers: [composer] });
    const update = h.kit.updates.privateText("hi");

    await h.deliver(update);

    expect(h.logger.records.filter((record) => record.event === "update.processed")).toEqual([
      {
        level: "info",
        event: "update.processed",
        updateId: update.update_id,
        updateKind: "message",
        chatType: "private",
        outcome: "handled",
        durationMs: 250,
      },
    ]);
  });

  it("gives handlers a logger bound to the update id, kind and chat type only", async () => {
    const composer = new Composer<BotContext>();
    composer.on("message:text", (ctx) => {
      ctx.log.info("handler.ran");
    });
    const h = createPipelineHarness({ composers: [composer] });
    const update = h.kit.updates.privateText("hi");

    await h.deliver(update);

    expect(h.logger.records.find((record) => record.event === "handler.ran")).toEqual({
      level: "info",
      event: "handler.ran",
      updateId: update.update_id,
      updateKind: "message",
      chatType: "private",
    });
  });

  it("logs no message text, name, username or token for a full update, even when a handler misuses fields", async () => {
    const composer = new Composer<BotContext>();
    composer.on("message:text", async (ctx) => {
      // A careless handler logging user content is still redacted.
      ctx.log.info("handler.careless", { text: ctx.msg.text, username: ctx.from.username, first_name: ctx.from.first_name });
      await ctx.reply("Готово");
    });
    const h = createPipelineHarness({ composers: [composer] });

    await h.deliver(h.kit.updates.privateText("Позвонить маме завтра в 10", { from: ALEX }));
    h.logger.info("startup", { token: TEST_BOT_TOKEN, detail: `bot${TEST_BOT_TOKEN}` });

    const logs = h.logger.serialized();
    expect(logs).not.toContain("Позвонить");
    expect(logs).not.toContain("alex_test");
    expect(logs).not.toContain("Alex");
    expect(logs).not.toContain("TEST_TOKEN_PLACEHOLDER");
    expect(logs).toContain("handler.careless");
  });
});
