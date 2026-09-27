import { Composer } from "grammy";
import { describe, expect, it } from "vitest";
import { getCatalog } from "../render";
import { expectCall } from "../testing/assertions";
import { createDeferred, createPipelineHarness, flushMicrotasks } from "../testing/pipelineHarness";
import type { BotContext } from "./context";
import { UpdateProcessingError } from "./errors";

const ru = getCatalog("ru");

/**
 * These tests each isolate one middleware-ordering decision documented in
 * `createBot.ts`. Every one of the four reorderings named there (sequentialize
 * before dedupe; callbackAnswers outside errorBoundary; errorBoundary outside
 * logging; dedupe outside errorBoundary) makes exactly one of these fail, so
 * the order stays pinned even though the ordinary pipeline tests do not
 * exercise these specific failure shapes.
 */
describe("pipeline: middleware order is load-bearing", () => {
  it("a deduper that throws is still caught by the error boundary (dedupe is inside errorBoundary)", async () => {
    const throwingDeduper = {
      claim: async (): Promise<"claimed" | "duplicate"> => {
        throw new Error("deduper backing store is down");
      },
      release: async (): Promise<void> => undefined,
    };
    const h = createPipelineHarness({ services: { deduper: throwingDeduper } });

    const error = await h.deliverExpectingFailure(h.kit.updates.privateText("hi"));

    expect(error).toBeInstanceOf(UpdateProcessingError);
    expect(error.causeCode).toBe("unexpected");
    expectCall(h.kit, "sendMessage", { text: ru.notices.failure });
    expect(h.logger.records).toContainEqual(expect.objectContaining({ event: "update.failed" }));
  });

  it("rejects a redelivery of a still-processing update at once, instead of waiting behind it in the chat's queue (dedupe is before sequentialize)", async () => {
    const order: string[] = [];
    const gate = createDeferred();
    const composer = new Composer<BotContext>();
    composer.on("message:text", async () => {
      order.push("start");
      await gate.promise;
      order.push("end");
    });
    const h = createPipelineHarness({ composers: [composer] });
    const update = h.kit.updates.privateText("slow");

    const first = h.deliver(update);
    await flushMicrotasks();
    expect(order).toEqual(["start"]);

    // A redelivery of the SAME update while the first attempt is still in
    // flight (a webhook retry after a slow response). If sequentialize ran
    // first, this would queue behind `first` on the chat key and only settle
    // once the handler above finishes; it must instead settle right away.
    const second = h.deliver(update);
    await second;

    expect(order).toEqual(["start"]);
    expect(h.logger.records).toContainEqual(expect.objectContaining({ event: "update.duplicate" }));

    gate.resolve();
    await first;
    expect(order).toEqual(["start", "end"]);
  });

  it("a failure of the automatic empty callback answer surfaces as UpdateProcessingError (callbackAnswers is inside errorBoundary)", async () => {
    // No composer answers the callback, so callbackAnswers auto-answers after
    // the handlers return; that automatic answer is made to fail here.
    const h = createPipelineHarness();
    const card = h.kit.updates.privateText("card").message;
    h.kit.fake.registerIncomingMessage(card);
    h.kit.fake.failNext("answerCallbackQuery", { error_code: 400, description: "Bad Request: chat not found" });

    const error = await h.deliverExpectingFailure(h.kit.updates.callbackQuery(card, "v1:noop:tok00001"));

    expect(error).toBeInstanceOf(UpdateProcessingError);
    expect(error.causeCode).toBe("telegram_bad_request");
    // The first (automatic) answer failed; the error boundary then answered
    // again itself, with the notice, which is what actually reaches the user.
    const answers = h.kit.fake.callsTo("answerCallbackQuery");
    expect(answers.map((call) => call.outcome.kind)).toEqual(["error", "ok"]);
    expect(answers[1]?.payload).toMatchObject({ text: ru.notices.failure, show_alert: true });
  });

  it("logs update.failed before update.processed for a failing update (errorBoundary is inside logging)", async () => {
    const composer = new Composer<BotContext>();
    composer.on("message:text", () => {
      throw new Error("boom");
    });
    const h = createPipelineHarness({ composers: [composer] });

    await h.deliverExpectingFailure(h.kit.updates.privateText("hi"));

    const events = h.logger.records.map((record) => record.event);
    expect(events).toContain("update.failed");
    expect(events).toContain("update.processed");
    expect(events.indexOf("update.failed")).toBeLessThan(events.indexOf("update.processed"));
  });
});
