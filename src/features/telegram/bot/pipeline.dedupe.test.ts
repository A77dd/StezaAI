import { Composer } from "grammy";
import { describe, expect, it } from "vitest";
import { createPipelineHarness } from "../testing/pipelineHarness";
import { expectCall } from "../testing/assertions";
import { fakeFailures } from "../testing/fakeBotApi";
import type { BotContext } from "./context";

describe("pipeline: update deduplication", () => {
  it("handles a redelivered update once and logs the duplicate", async () => {
    const composer = new Composer<BotContext>();
    const handled: string[] = [];
    composer.on("message:text", (ctx) => {
      handled.push(ctx.msg.text);
    });
    const h = createPipelineHarness({ composers: [composer] });
    const update = h.kit.updates.privateText("hello");

    await h.deliver(update);
    await h.deliver(update);

    expect(handled).toEqual(["hello"]);
    expect(h.logger.records.filter((record) => record.event === "update.duplicate")).toEqual([
      { level: "info", event: "update.duplicate", updateId: update.update_id },
    ]);
  });

  it("logs a duplicate with outcome duplicate, not handled", async () => {
    const h = createPipelineHarness();
    const update = h.kit.updates.privateText("hello");

    await h.deliver(update);
    await h.deliver(update);

    const outcomes = h.logger.records
      .filter((record) => record.event === "update.processed")
      .map((record) => record.outcome);
    expect(outcomes).toEqual(["handled", "duplicate"]);
  });

  it("does not treat an older id after a newer one as a duplicate (ids are a set)", async () => {
    const composer = new Composer<BotContext>();
    const handled: number[] = [];
    composer.on("message:text", (ctx) => {
      handled.push(ctx.update.update_id);
    });
    const h = createPipelineHarness({ composers: [composer] });
    const first = h.kit.updates.privateText("a");
    const second = h.kit.updates.privateText("b");

    await h.deliver(second);
    await h.deliver(first);

    expect(handled).toEqual([second.update_id, first.update_id]);
  });

  it("releases the update when handling fails, so the runtime's retry is processed", async () => {
    const composer = new Composer<BotContext>();
    let attempts = 0;
    composer.on("message:text", (ctx) => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient failure");
      return ctx.reply("done");
    });
    const h = createPipelineHarness({ composers: [composer] });
    const update = h.kit.updates.privateText("please");

    await h.deliverExpectingFailure(update);
    await h.deliver(update);

    expect(attempts).toBe(2);
    expectCall(h.kit, "sendMessage", { text: "done" });
  });

  it("keeps a successfully handled update claimed", async () => {
    const composer = new Composer<BotContext>();
    let attempts = 0;
    composer.on("message:text", () => {
      attempts += 1;
    });
    const h = createPipelineHarness({ composers: [composer] });
    const update = h.kit.updates.privateText("once");

    await h.deliver(update);
    await h.deliver(update);
    await h.deliver(update);

    expect(attempts).toBe(1);
  });

  it("does not answer a redelivered callback query (the first delivery owns the answer)", async () => {
    const composer = new Composer<BotContext>();
    composer.on("callback_query", (ctx) => ctx.answerCallbackQuery({ text: "ok" }));
    const h = createPipelineHarness({ composers: [composer] });
    const card = h.kit.updates.privateText("card").message;
    h.kit.fake.registerIncomingMessage(card);
    const press = h.kit.updates.callbackQuery(card, "v1:noop:tok00001");

    await h.deliver(press);
    await h.deliver(press);

    expect(h.kit.fake.callsTo("answerCallbackQuery")).toHaveLength(1);
    expect(h.logger.records.some((record) => record.event === "callback.unanswered")).toBe(false);
  });

  it("releases the claim also when the failure was a blocked chat", async () => {
    // A 403 skips the notice but still fails the update, like any other failure.
    const composer = new Composer<BotContext>();
    composer.on("message:text", (ctx) => ctx.reply("hi"));
    const h = createPipelineHarness({ composers: [composer] });
    h.kit.fake.failNext("sendMessage", fakeFailures.blockedByUser());
    const update = h.kit.updates.privateText("hello");

    const error = await h.deliverExpectingFailure(update);

    expect(error.causeCode).toBe("telegram_forbidden");
    await h.deliver(update);
    expectCall(h.kit, "sendMessage", { text: "hi" });
  });
});
