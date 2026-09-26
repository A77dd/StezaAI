import { GrammyError, HttpError } from "grammy";
import { describe, expect, it } from "vitest";
import { renderMessage, text } from "../render";
import { expectCall } from "../testing/assertions";
import { fakeFailures } from "../testing/fakeBotApi";
import { ALEX } from "../testing/participants";
import { TEST_BOT_TOKEN, createHandlerHarness } from "../testing/pipelineHarness";
import type { BotContext } from "./context";
import { editCard, sendCard } from "./presenter";

const card = renderMessage({ body: text("Готово") });

/**
 * A pipeline whose handler runs `fn` once for a private message. What `fn`
 * throws is captured and returned, so a test can inspect the error a caller
 * of the Bot API would see.
 */
async function run(
  prepare: (h: ReturnType<typeof createHandlerHarness>) => void,
  fn: (ctx: BotContext) => Promise<unknown>,
) {
  let failure: unknown;
  const h = createHandlerHarness(async (ctx) => {
    try {
      await fn(ctx);
    } catch (error) {
      failure = error;
    }
  });
  prepare(h);
  await h.deliver(h.kit.updates.privateText("hello"));
  return { h, failure };
}

function editTo(ctx: BotContext, messageId: number, body: string) {
  return editCard(
    ctx,
    { kind: "chat", chatId: ALEX.id, messageId },
    renderMessage({ body: text(body) }),
  );
}

describe("outbound policy: rate limits", () => {
  it("retries a 429 once, honouring retry_after, and the send goes through", async () => {
    const { h, failure } = await run(
      (h) => h.kit.fake.failNext("sendMessage", fakeFailures.tooManyRequests(4)),
      (ctx) => sendCard(ctx, card),
    );

    expect(failure).toBeUndefined();
    expect(h.sleeps).toEqual([4000]);
    expect(h.kit.fake.callsTo("sendMessage").map((call) => call.outcome.kind)).toEqual(["error", "ok"]);
    expect(h.logger.records).toContainEqual({
      level: "warn",
      event: "outbound.retry",
      method: "sendMessage",
      attempt: 1,
      delayMs: 4000,
      reason: "rate_limited",
    });
  });

  it("does not wait for a retry_after over 30 seconds: the caller sees the 429", async () => {
    const { h, failure } = await run(
      (h) => h.kit.fake.failNext("sendMessage", fakeFailures.tooManyRequests(120)),
      (ctx) => sendCard(ctx, card),
    );

    expect(failure).toBeInstanceOf(GrammyError);
    expect(failure).toMatchObject({ error_code: 429, parameters: { retry_after: 120 } });
    expect(h.sleeps).toEqual([]);
    expect(h.kit.fake.callsTo("sendMessage")).toHaveLength(1);
  });

  it("gives up after 3 retries of a persistent 429", async () => {
    const { h, failure } = await run(
      (h) => h.kit.fake.failNext("sendMessage", fakeFailures.tooManyRequests(1), 10),
      (ctx) => sendCard(ctx, card),
    );

    expect(failure).toBeInstanceOf(GrammyError);
    expect(h.kit.fake.callsTo("sendMessage")).toHaveLength(4);
    expect(h.sleeps).toEqual([1000, 1000, 1000]);
  });

  it("retries answerCallbackQuery after a 429", async () => {
    const h = createHandlerHarness(async (ctx) => {
      await ctx.answerCallbackQuery({ text: "ok" });
    });
    h.kit.fake.failNext("answerCallbackQuery", fakeFailures.tooManyRequests(2));
    const message = h.kit.updates.privateText("card").message;
    h.kit.fake.registerIncomingMessage(message);

    await h.deliver(h.kit.updates.callbackQuery(message, "v1:noop:tok00001"));

    expect(h.sleeps).toEqual([2000]);
    expectCall(h.kit, "answerCallbackQuery", { text: "ok" });
  });
});

describe("outbound policy: sends are not repeated after an ambiguous failure", () => {
  it("does NOT retry sendMessage after a network failure that delivered the message (no duplicate)", async () => {
    const { h, failure } = await run(
      (h) => h.kit.fake.failNext("sendMessage", fakeFailures.networkErrorAfterDelivery()),
      (ctx) => sendCard(ctx, card),
    );

    expect(failure).toBeInstanceOf(HttpError);
    // The fake delivered the message once; a retry would have made two.
    const delivered = h.kit.fake.messages.sentByBot(ALEX.id).filter((record) => record.message.text === "Готово");
    expect(delivered).toHaveLength(1);
    expect(h.kit.fake.callsTo("sendMessage")).toHaveLength(1);
    expect(h.sleeps).toEqual([]);
  });

  it("does NOT retry sendMessage after a 502 either", async () => {
    const { h, failure } = await run(
      (h) => h.kit.fake.failNext("sendMessage", fakeFailures.serverError()),
      (ctx) => sendCard(ctx, card),
    );

    expect(failure).toMatchObject({ error_code: 502 });
    expect(h.kit.fake.callsTo("sendMessage")).toHaveLength(1);
  });
});

describe("outbound policy: idempotent methods are retried", () => {
  it("retries an edit after a network failure that had already applied it, and reports unchanged", async () => {
    let outcome: string | undefined;
    const { h, failure } = await run(
      (h) => h.kit.fake.failNext("editMessageText", fakeFailures.networkErrorAfterDelivery()),
      async (ctx) => {
        const sent = await sendCard(ctx, card);
        outcome = await editTo(ctx, sent.message_id, "Обновлено");
      },
    );

    expect(failure).toBeUndefined();
    expect(h.kit.fake.callsTo("editMessageText")).toHaveLength(2);
    // The first attempt applied the edit; the retry finds nothing left to change.
    expect(outcome).toBe("unchanged");
    expect(h.kit.fake.messages.sentByBot(ALEX.id)[0]?.message.text).toBe("Обновлено");
    expect(h.sleeps).toEqual([1000]);
  });

  it("retries an edit after 502s with exponential backoff", async () => {
    const { h, failure } = await run(
      (h) => h.kit.fake.failNext("editMessageText", fakeFailures.serverError(), 2),
      async (ctx) => {
        const sent = await sendCard(ctx, card);
        await editTo(ctx, sent.message_id, "Обновлено");
      },
    );

    expect(failure).toBeUndefined();
    expect(h.sleeps).toEqual([1000, 2000]);
    expect(h.kit.fake.callsTo("editMessageText")).toHaveLength(3);
  });

  it("gives up on a network failure of an idempotent method after 3 retries", async () => {
    const { h, failure } = await run(
      (h) => h.kit.fake.failNext("getMe", fakeFailures.networkError(), 10),
      (ctx) => ctx.api.getMe(),
    );

    expect(failure).toBeInstanceOf(HttpError);
    expect(h.kit.fake.callsTo("getMe")).toHaveLength(4);
  });
});

describe("token redaction of transport errors", () => {
  const url = `request to https://api.example.test/bot${TEST_BOT_TOKEN}/sendMessage failed, reason: socket hang up`;

  it("removes the bot token from the message, stack and cause of a network error", async () => {
    const { failure } = await run(
      (h) => h.kit.fake.failNext("sendMessage", fakeFailures.networkError(url)),
      (ctx) => ctx.api.sendMessage(ALEX.id, "x"),
    );

    expect(failure).toBeInstanceOf(HttpError);
    const error = failure as HttpError;
    const cause = error.error as Error;
    for (const value of [error.message, error.stack ?? "", cause.message, cause.stack ?? ""]) {
      expect(value).not.toContain("TEST_TOKEN_PLACEHOLDER");
    }
    expect(cause.message).toContain("socket hang up");
    expect(cause.message).toContain("/bot[redacted]/sendMessage");
  });

  it("leaves Bot API errors unchanged", async () => {
    const { failure } = await run(
      (h) => h.kit.fake.failNext("sendMessage", { error_code: 400, description: "Bad Request: chat not found" }),
      (ctx) => ctx.api.sendMessage(ALEX.id, "x"),
    );

    expect(failure).toBeInstanceOf(GrammyError);
    expect(failure).toMatchObject({ error_code: 400, description: "Bad Request: chat not found" });
  });
});
