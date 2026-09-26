import { Composer } from "grammy";
import { describe, expect, it } from "vitest";
import { ALEX, BORIS } from "../testing/participants";
import { createDeferred, createPipelineHarness, flushMicrotasks } from "../testing/pipelineHarness";
import type { BotContext } from "./context";
import { orderingKeyOf } from "./middleware/sequentialize";

describe("pipeline: per-chat ordering", () => {
  it("processes two updates of one chat in order even when the first handler is slow", async () => {
    const order: string[] = [];
    const firstGate = createDeferred();
    const composer = new Composer<BotContext>();
    composer.on("message:text", async (ctx) => {
      order.push(`start ${ctx.msg.text}`);
      if (ctx.msg.text === "first") await firstGate.promise;
      order.push(`end ${ctx.msg.text}`);
    });
    const h = createPipelineHarness({ composers: [composer] });

    const first = h.deliver(h.kit.updates.privateText("first"));
    const second = h.deliver(h.kit.updates.privateText("second"));
    await flushMicrotasks();
    expect(order).toEqual(["start first"]);

    firstGate.resolve();
    await Promise.all([first, second]);

    expect(order).toEqual(["start first", "end first", "start second", "end second"]);
  });

  it("does not make different chats wait for each other", async () => {
    const order: string[] = [];
    const gate = createDeferred();
    const composer = new Composer<BotContext>();
    composer.on("message:text", async (ctx) => {
      order.push(`start ${ctx.msg.text}`);
      if (ctx.msg.text === "slow") await gate.promise;
      order.push(`end ${ctx.msg.text}`);
    });
    const h = createPipelineHarness({ composers: [composer] });

    const slow = h.deliver(h.kit.updates.privateText("slow", { from: ALEX }));
    const other = h.deliver(h.kit.updates.privateText("fast", { from: BORIS }));
    await flushMicrotasks();

    expect(order).toEqual(["start slow", "start fast", "end fast"]);
    gate.resolve();
    await Promise.all([slow, other]);
  });

  it("keeps ordering after a failed update (the queue does not stall)", async () => {
    const order: string[] = [];
    const composer = new Composer<BotContext>();
    composer.on("message:text", (ctx) => {
      order.push(ctx.msg.text);
      if (ctx.msg.text === "bad") throw new Error("boom");
    });
    const h = createPipelineHarness({ composers: [composer] });

    const bad = h.deliverExpectingFailure(h.kit.updates.privateText("bad"));
    const good = h.deliver(h.kit.updates.privateText("good"));
    await Promise.all([bad, good]);

    expect(order).toEqual(["bad", "good"]);
  });
});

describe("orderingKeyOf", () => {
  const key = (update: Parameters<typeof orderingKeyOf>[0]["update"]): string | undefined =>
    orderingKeyOf({ update, chat: update.message?.chat, from: update.message?.from ?? update.inline_query?.from } as never);

  it("orders by chat, and by user when there is no chat", () => {
    const h = createPipelineHarness();
    expect(key(h.kit.updates.privateText("x", { from: ALEX }))).toBe(String(ALEX.id));
    expect(key(h.kit.updates.inlineQuery("q", { from: BORIS }))).toBe(String(BORIS.id));
  });

  it("orders a guest message by its user, not by the chat the bot is not part of", () => {
    const h = createPipelineHarness();
    const update = h.kit.updates.guestMessage("hi", { from: BORIS });
    const guestKey = orderingKeyOf({
      update,
      chat: update.guest_message?.chat,
      from: update.guest_message?.from,
    } as never);

    expect(guestKey).toBe(String(BORIS.id));
  });

  it("gives no key to an update with neither chat nor user", () => {
    expect(orderingKeyOf({ update: { update_id: 1 } } as never)).toBeUndefined();
  });
});
