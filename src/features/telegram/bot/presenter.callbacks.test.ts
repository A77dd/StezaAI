import { Composer } from "grammy";
import { describe, expect, it } from "vitest";
import { fakeFailures } from "../testing/fakeBotApi";
import { ALEX, BORIS, createGroupChat } from "../testing/participants";
import { createHandlerHarness, createPipelineHarness } from "../testing/pipelineHarness";
import type { PipelineHarness } from "../testing/pipelineHarness";
import type { BotContext } from "./context";
import { PresenterError } from "./errors";
import { answerCallback, ownerOf, targetOfCallback } from "./presenter";

const harnessRunning = createHandlerHarness;

describe("answerCallback", () => {
  const press = (h: PipelineHarness) => {
    const card = h.kit.updates.privateText("card").message;
    h.kit.fake.registerIncomingMessage(card);
    return h.kit.updates.callbackQuery(card, "v1:noop:tok00001");
  };

  it("answers with a toast, or an alert when asked", async () => {
    const composer = new Composer<BotContext>();
    composer.on("callback_query", async (ctx) => {
      await answerCallback(ctx, "Поставил", { alert: true });
    });
    const h = createPipelineHarness({ composers: [composer] });

    await h.deliver(press(h));

    expect(h.kit.fake.lastCall("answerCallbackQuery")?.payload).toMatchObject({
      text: "Поставил",
      show_alert: true,
    });
  });

  it("answers without text and without alert by default", async () => {
    const composer = new Composer<BotContext>();
    composer.on("callback_query", (ctx) => answerCallback(ctx));
    const h = createPipelineHarness({ composers: [composer] });
    const update = press(h);

    await h.deliver(update);

    expect(h.kit.fake.lastCall("answerCallbackQuery")?.payload).toEqual({ callback_query_id: update.callback_query.id });
  });

  it("refuses text over 200 characters instead of cutting it", async () => {
    let failure: unknown;
    const composer = new Composer<BotContext>();
    composer.on("callback_query", async (ctx) => {
      try {
        await answerCallback(ctx, "я".repeat(201));
      } catch (error) {
        failure = error;
      }
    });
    const h = createPipelineHarness({ composers: [composer] });

    await h.deliver(press(h));

    expect(failure).toBeInstanceOf(PresenterError);
  });

  it("refuses to answer an update that is not a callback query", async () => {
    let failure: unknown;
    const h = harnessRunning(async (ctx) => {
      try {
        await answerCallback(ctx, "x");
      } catch (error) {
        failure = error;
      }
    });

    await h.deliver(h.kit.updates.privateText("hi"));

    expect(failure).toBeInstanceOf(PresenterError);
  });

  it("does not answer twice when a handler answers through the presenter and the pipeline sees it", async () => {
    const composer = new Composer<BotContext>();
    composer.on("callback_query", async (ctx) => {
      await answerCallback(ctx, "раз");
      await answerCallback(ctx, "два");
    });
    const h = createPipelineHarness({ composers: [composer] });

    await h.deliver(press(h));

    expect(h.kit.fake.callsTo("answerCallbackQuery")).toHaveLength(1);
  });

  it("treats a stale query as answered instead of failing", async () => {
    const composer = new Composer<BotContext>();
    composer.on("callback_query", (ctx) => answerCallback(ctx, "поздно"));
    const h = createPipelineHarness({ composers: [composer] });
    h.kit.fake.failNext("answerCallbackQuery", fakeFailures.queryTooOld());

    await expect(h.deliver(press(h))).resolves.toBeUndefined();
  });
});

describe("ownerOf / targetOfCallback", () => {
  it("scopes to the user and the update's chat", async () => {
    const owners: unknown[] = [];
    const group = createGroupChat();
    const h = harnessRunning(async (ctx) => {
      owners.push(ownerOf(ctx));
    });

    await h.deliver(h.kit.updates.privateText("hi", { from: ALEX }));
    await h.deliver(h.kit.updates.groupMention("@steza_test_bot hi", { chat: group, from: BORIS }));

    expect(owners).toEqual([
      { userId: String(ALEX.id), chatId: ALEX.id },
      { userId: String(BORIS.id), chatId: group.id },
    ]);
  });

  it("uses the user's own id as the chat for an inline message (no chat exists)", async () => {
    const owners: unknown[] = [];
    const h = harnessRunning(async (ctx) => {
      owners.push(ownerOf(ctx));
    });

    await h.deliver(h.kit.updates.inlineQuery("q", { from: BORIS }));

    expect(owners).toEqual([{ userId: String(BORIS.id), chatId: BORIS.id }]);
  });

  it("names the message of a callback in a chat", async () => {
    const targets: unknown[] = [];
    const composer = new Composer<BotContext>();
    composer.on("callback_query", async (ctx) => {
      targets.push(targetOfCallback(ctx));
      await ctx.answerCallbackQuery();
    });
    const h = createPipelineHarness({ composers: [composer] });
    const card = h.kit.updates.privateText("card").message;
    h.kit.fake.registerIncomingMessage(card);

    await h.deliver(h.kit.updates.callbackQuery(card, "v1:noop:tok00001"));

    expect(targets).toEqual([{ kind: "chat", chatId: ALEX.id, messageId: card.message_id }]);
  });

  it("refuses a target for an update that is not a callback query", async () => {
    let failure: unknown;
    const h = harnessRunning(async (ctx) => {
      try {
        targetOfCallback(ctx);
      } catch (error) {
        failure = error;
      }
    });

    await h.deliver(h.kit.updates.privateText("hi"));

    expect(failure).toBeInstanceOf(PresenterError);
  });
});
