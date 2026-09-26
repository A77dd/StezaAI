import { Composer } from "grammy";
import { describe, expect, it } from "vitest";
import { expectCallbackAnsweredOnce, expectCall } from "../testing/assertions";
import { fakeFailures } from "../testing/fakeBotApi";
import { createPipelineHarness } from "../testing/pipelineHarness";
import type { BotContext } from "./context";
import { hasAnsweredCallback } from "./middleware/callbackAnswers";

function pressOn(h: ReturnType<typeof createPipelineHarness>) {
  const card = h.kit.updates.privateText("card").message;
  h.kit.fake.registerIncomingMessage(card);
  return h.kit.updates.callbackQuery(card, "v1:noop:tok00001");
}

describe("pipeline: callback queries are answered exactly once", () => {
  it("answers with no text when the handler forgets, and warns", async () => {
    const composer = new Composer<BotContext>();
    composer.on("callback_query", () => undefined);
    const h = createPipelineHarness({ composers: [composer] });
    const press = pressOn(h);

    await h.deliver(press);

    expectCallbackAnsweredOnce(h.kit, press.callback_query.id);
    expect(h.kit.fake.lastCall("answerCallbackQuery")?.payload).toEqual({
      callback_query_id: press.callback_query.id,
    });
    expect(h.logger.records).toContainEqual(
      expect.objectContaining({ level: "warn", event: "callback.unanswered", updateId: press.update_id }),
    );
  });

  it("answers with no text when no handler matches at all", async () => {
    const h = createPipelineHarness();
    const press = pressOn(h);

    await h.deliver(press);

    expectCallbackAnsweredOnce(h.kit, press.callback_query.id);
  });

  it("does not answer again when the handler already did, and does not warn", async () => {
    const composer = new Composer<BotContext>();
    composer.on("callback_query", (ctx) => ctx.answerCallbackQuery({ text: "done" }));
    const h = createPipelineHarness({ composers: [composer] });
    const press = pressOn(h);

    await h.deliver(press);

    expectCallbackAnsweredOnce(h.kit, press.callback_query.id);
    expectCall(h.kit, "answerCallbackQuery", { text: "done" });
    expect(h.logger.records.some((record) => record.event === "callback.unanswered")).toBe(false);
  });

  it("suppresses a second answer from the handler and logs it", async () => {
    const composer = new Composer<BotContext>();
    composer.on("callback_query", async (ctx) => {
      await ctx.answerCallbackQuery({ text: "first" });
      await ctx.answerCallbackQuery({ text: "second" });
    });
    const h = createPipelineHarness({ composers: [composer] });
    const press = pressOn(h);

    await h.deliver(press);

    expectCallbackAnsweredOnce(h.kit, press.callback_query.id);
    expectCall(h.kit, "answerCallbackQuery", { text: "first" });
    expect(h.logger.records.filter((record) => record.event === "callback.answered_twice")).toHaveLength(1);
  });

  it("suppresses a concurrent second answer while the first is in flight", async () => {
    const composer = new Composer<BotContext>();
    composer.on("callback_query", async (ctx) => {
      await Promise.all([ctx.answerCallbackQuery({ text: "a" }), ctx.answerCallbackQuery({ text: "b" })]);
    });
    const h = createPipelineHarness({ composers: [composer] });
    const press = pressOn(h);

    await h.deliver(press);

    expect(h.kit.fake.callsTo("answerCallbackQuery")).toHaveLength(1);
  });

  it("treats a stale query (too old / already answered) as answered, logs it and does not fail the update", async () => {
    const composer = new Composer<BotContext>();
    composer.on("callback_query", (ctx) => ctx.answerCallbackQuery({ text: "late" }));
    const h = createPipelineHarness({ composers: [composer] });
    h.kit.fake.failNext("answerCallbackQuery", fakeFailures.queryTooOld());

    await h.deliver(pressOn(h));

    expect(h.logger.records).toContainEqual(expect.objectContaining({ event: "callback.answer_stale" }));
    expect(h.kit.fake.callsTo("answerCallbackQuery")).toHaveLength(1);
  });

  it("propagates other answer failures and leaves the query answerable by the boundary", async () => {
    const composer = new Composer<BotContext>();
    let seenAnswered: boolean | undefined;
    composer.on("callback_query", async (ctx) => {
      try {
        await ctx.answerCallbackQuery({ text: "x" });
      } finally {
        seenAnswered = hasAnsweredCallback(ctx);
      }
    });
    const h = createPipelineHarness({ composers: [composer] });
    const press = pressOn(h);

    // A 502 on an idempotent method is retried by the outbound policy, so it must fail on every attempt.
    h.kit.fake.failNext("answerCallbackQuery", fakeFailures.serverError(), 10);
    const error = await h.deliverExpectingFailure(press);

    expect(error.causeCode).toBe("telegram_server_error");
    expect(seenAnswered).toBe(false);
  });

  it("leaves messages alone: the guard only applies to callback queries", async () => {
    const h = createPipelineHarness();

    await h.deliver(h.kit.updates.privateText("hello"));

    expect(h.kit.fake.callsTo("answerCallbackQuery")).toHaveLength(0);
  });
});
