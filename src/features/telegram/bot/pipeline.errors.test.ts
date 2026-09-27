import { Composer, GrammyError } from "grammy";
import { describe, expect, it } from "vitest";
import { getCatalog } from "../render";
import { CallbackNotFoundError } from "../callbacks";
import { expectCall, expectNoCalls } from "../testing/assertions";
import { fakeFailures } from "../testing/fakeBotApi";
import { ALEX, createGroupChat } from "../testing/participants";
import { TEST_BOT_TOKEN, createPipelineHarness } from "../testing/pipelineHarness";
import type { BotContext } from "./context";
import { UpdateProcessingError } from "./errors";

const ru = getCatalog("ru");
const en = getCatalog("en");

function failingComposer(error: () => unknown): Composer<BotContext> {
  const composer = new Composer<BotContext>();
  composer.on("message:text", () => {
    throw error();
  });
  return composer;
}

describe("pipeline: error boundary", () => {
  it("sends one user notice, logs the failure and rethrows a typed error with the cause", async () => {
    const cause = new TypeError("boom with private words");
    const h = createPipelineHarness({ composers: [failingComposer(() => cause)] });
    const update = h.kit.updates.privateText("my secret plan");

    const error = await h.deliverExpectingFailure(update);

    expect(error).toBeInstanceOf(UpdateProcessingError);
    expect(error.code).toBe("update_processing_failed");
    expect(error.updateId).toBe(update.update_id);
    expect(error.causeCode).toBe("unexpected");
    expect(error.cause).toBe(cause);
    expect(h.kit.fake.callsTo("sendMessage")).toHaveLength(1);
    expectCall(h.kit, "sendMessage", { chat_id: ALEX.id, text: ru.notices.failure });
    expect(h.logger.records.filter((record) => record.event === "update.failed")).toEqual([
      {
        level: "error",
        event: "update.failed",
        updateId: update.update_id,
        updateKind: "message",
        chatType: "private",
        errorClass: "TypeError",
        errorCode: "unexpected",
      },
    ]);
  });

  it("keeps the log free of message text, the failure's own words and the token", async () => {
    const h = createPipelineHarness({ composers: [failingComposer(() => new TypeError("boom with private words"))] });

    await h.deliverExpectingFailure(h.kit.updates.privateText("my secret plan"));

    const logs = h.logger.serialized();
    expect(logs).not.toContain("secret plan");
    expect(logs).not.toContain("private words");
    expect(logs).not.toContain(TEST_BOT_TOKEN);
    expect(logs).not.toContain("alex_test");
    expect(logs).not.toContain("Alex");
  });

  it("writes one update.processed record with the failed outcome", async () => {
    const h = createPipelineHarness({ composers: [failingComposer(() => new Error("x"))] });
    const update = h.kit.updates.privateText("hi");

    await h.deliverExpectingFailure(update);

    expect(h.logger.records.filter((record) => record.event === "update.processed")).toEqual([
      {
        level: "info",
        event: "update.processed",
        updateId: update.update_id,
        updateKind: "message",
        chatType: "private",
        outcome: "failed",
        durationMs: 0,
      },
    ]);
  });

  it("answers in English for an English-speaking user without stored settings", async () => {
    const h = createPipelineHarness({ composers: [failingComposer(() => new Error("x"))] });
    const english = { ...ALEX, language_code: "en" };

    await h.deliverExpectingFailure(h.kit.updates.privateText("hi", { from: english }));

    expectCall(h.kit, "sendMessage", { text: en.notices.failure });
  });

  it("replies to the invoking message in a group", async () => {
    const h = createPipelineHarness({ composers: [failingComposer(() => new Error("x"))] });
    const group = createGroupChat();
    const update = h.kit.updates.groupMention("@steza_test_bot plan", { chat: group });

    await h.deliverExpectingFailure(update);

    expectCall(h.kit, "sendMessage", {
      chat_id: group.id,
      text: ru.notices.failure,
      reply_parameters: { message_id: update.message.message_id },
    });
  });

  it("does not try to notify a user who blocked the bot (403)", async () => {
    const composer = new Composer<BotContext>();
    composer.on("message:text", (ctx) => ctx.reply("hello"));
    const h = createPipelineHarness({ composers: [composer] });
    h.kit.fake.failNext("sendMessage", fakeFailures.blockedByUser());

    const error = await h.deliverExpectingFailure(h.kit.updates.privateText("hi"));

    expect(error.causeCode).toBe("telegram_forbidden");
    expect(h.kit.fake.callsTo("sendMessage")).toHaveLength(1);
    expect(h.logger.records).toContainEqual(
      expect.objectContaining({ event: "update.notice_skipped", reason: "skipped_forbidden" }),
    );
  });

  it("does not try to notify a chat that is already being rate-limited (429)", async () => {
    const composer = new Composer<BotContext>();
    composer.on("message:text", (ctx) => ctx.reply("hello"));
    const h = createPipelineHarness({ composers: [composer] });
    // Persistent: outlasts boundedRetry's own retries, so the update itself fails with a 429.
    h.kit.fake.failNext("sendMessage", fakeFailures.tooManyRequests(1), 10);

    const error = await h.deliverExpectingFailure(h.kit.updates.privateText("hi"));

    expect(error.causeCode).toBe("telegram_rate_limited");
    expect(h.kit.fake.callsTo("sendMessage")).toHaveLength(4);
    expect(h.logger.records).toContainEqual(
      expect.objectContaining({ event: "update.notice_skipped", reason: "skipped_rate_limited" }),
    );
  });

  it("logs a failed notice and still rethrows the original error", async () => {
    const cause = new TypeError("original");
    const h = createPipelineHarness({ composers: [failingComposer(() => cause)] });
    h.kit.fake.failNext("sendMessage", fakeFailures.messageNotModified());

    const error = await h.deliverExpectingFailure(h.kit.updates.privateText("hi"));

    expect(error.cause).toBe(cause);
    expect(h.logger.records).toContainEqual(
      expect.objectContaining({ event: "update.notice_failed", errorCode: "telegram_message_not_modified" }),
    );
  });

  it("sends no notice for update kinds where nobody waits for one", async () => {
    const composer = new Composer<BotContext>();
    composer.on("inline_query", () => {
      throw new Error("x");
    });
    const h = createPipelineHarness({ composers: [composer] });

    await h.deliverExpectingFailure(h.kit.updates.inlineQuery("свободное время"));

    expectNoCalls(h.kit);
    expect(h.logger.records).toContainEqual(
      expect.objectContaining({ event: "update.notice_skipped", reason: "skipped_kind" }),
    );
  });

  it("maps a layer error to its own notice by code", async () => {
    const h = createPipelineHarness({
      composers: [
        failingComposer(() => new CallbackNotFoundError("unknown_token")),
      ],
    });

    await h.deliverExpectingFailure(h.kit.updates.privateText("hi"));

    expectCall(h.kit, "sendMessage", { text: ru.notices.unavailable });
  });

  it("reports a failure before the context is enriched (the store fails) without I/O in the notice", async () => {
    const h = createPipelineHarness({
      services: {
        settings: {
          get: () => Promise.reject(new Error("settings store down")),
          upsert: () => Promise.reject(new Error("unused")),
          delete: () => Promise.reject(new Error("unused")),
        },
      },
    });

    const error = await h.deliverExpectingFailure(h.kit.updates.privateText("hi"));

    expect(error.causeCode).toBe("unexpected");
    expectCall(h.kit, "sendMessage", { text: ru.notices.failure });
  });

  it("does not leak the API request (message text) through the logged Bot API error", async () => {
    const composer = new Composer<BotContext>();
    // Over 4096 characters: the Bot API rejects it and the error carries the request.
    composer.on("message:text", (ctx) => ctx.reply(`reply body ${"x".repeat(5000)}`));
    const h = createPipelineHarness({ composers: [composer] });

    const error = await h.deliverExpectingFailure(h.kit.updates.privateText("hi"));

    expect(error.cause).toBeInstanceOf(GrammyError);
    expect(h.logger.serialized()).not.toContain("reply body");
  });
});
