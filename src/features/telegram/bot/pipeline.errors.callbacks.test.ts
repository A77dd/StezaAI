import { Composer } from "grammy";
import { describe, expect, it } from "vitest";
import { getCatalog } from "../render";
import { CallbackNotFoundError } from "../callbacks";
import { expectCall, expectNoCalls } from "../testing/assertions";
import { ALEX, BORIS, createGroupChat } from "../testing/participants";
import { createPipelineHarness } from "../testing/pipelineHarness";
import type { BotContext } from "./context";

const ru = getCatalog("ru");

describe("pipeline: callback failures", () => {
  it("answers a failed callback with the notice alert instead of sending a message", async () => {
    const composer = new Composer<BotContext>();
    composer.on("callback_query", () => {
      throw new Error("x");
    });
    const h = createPipelineHarness({ composers: [composer] });
    const card = h.kit.updates.privateText("card").message;
    h.kit.fake.registerIncomingMessage(card);

    const error = await h.deliverExpectingFailure(h.kit.updates.callbackQuery(card, "v1:noop:tok00001"));

    expect(error.causeCode).toBe("unexpected");
    expect(h.kit.fake.callsTo("answerCallbackQuery")).toHaveLength(1);
    expectCall(h.kit, "answerCallbackQuery", { text: ru.notices.failure, show_alert: true });
    expectNoCalls(h.kit, "sendMessage");
  });

  it("sends a message notice when the handler already answered the callback and then failed", async () => {
    const composer = new Composer<BotContext>();
    composer.on("callback_query", async (ctx) => {
      await ctx.answerCallbackQuery({ text: "working" });
      throw new Error("x");
    });
    const h = createPipelineHarness({ composers: [composer] });
    const card = h.kit.updates.privateText("card").message;
    h.kit.fake.registerIncomingMessage(card);

    await h.deliverExpectingFailure(h.kit.updates.callbackQuery(card, "v1:noop:tok00001"));

    expect(h.kit.fake.callsTo("answerCallbackQuery")).toHaveLength(1);
    expectCall(h.kit, "sendMessage", { text: ru.notices.failure });
  });

  it("never reveals that a button belongs to someone else (notice comes from the code only)", async () => {
    const composer = new Composer<BotContext>();
    composer.on("callback_query:data", async (ctx) => {
      const { userId, chatId } = { userId: String(ctx.from.id), chatId: ctx.chat?.id ?? 0 };
      await ctx.services.callbacks.resolve(ctx.callbackQuery.data, { userId, chatId });
    });
    const group = createGroupChat();
    const h = createPipelineHarness({ composers: [composer] });
    const data = await h.services.callbacks.issue({
      action: "noop",
      userId: String(ALEX.id),
      chatId: group.id,
      payload: {},
    });
    const card = h.kit.updates.groupMention("@steza_test_bot card", { chat: group }).message;
    h.kit.fake.registerIncomingMessage(card);

    // Boris presses Alex's button.
    const error = await h.deliverExpectingFailure(
      h.kit.updates.callbackQuery(card, data, { from: BORIS }),
    );

    expect(error.causeCode).toBe("callback_not_found");
    const answer = expectCall(h.kit, "answerCallbackQuery");
    expect(answer.payload.text).toBe(ru.notices.unavailable);
    const shown = JSON.stringify(answer.payload);
    expect(shown).not.toMatch(/owner|mismatch|чуж|another|не твоя/i);
    expect(h.logger.serialized()).not.toMatch(/owner_mismatch/);
  });

  it.each(["unknown_token", "action_mismatch", "owner_mismatch", "chat_mismatch"] as const)(
    "shows the same notice for a not-found callback whose reason is %s",
    async (reason) => {
      const composer = new Composer<BotContext>();
      composer.on("callback_query", () => {
        throw new CallbackNotFoundError(reason);
      });
      const h = createPipelineHarness({ composers: [composer] });
      const card = h.kit.updates.privateText("card").message;
      h.kit.fake.registerIncomingMessage(card);

      await h.deliverExpectingFailure(h.kit.updates.callbackQuery(card, "v1:noop:tok00001"));

      expectCall(h.kit, "answerCallbackQuery", { text: ru.notices.unavailable, show_alert: true });
    },
  );
});
