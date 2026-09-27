import { BotError, Composer, GrammyError } from "grammy";
import type { Transformer } from "grammy";
import { describe, expect, it } from "vitest";
import { parseTelegramConfig } from "../config";
import { fakeFailures } from "../testing/fakeBotApi";
import { TEST_BOT_TOKEN, createPipelineHarness, createTestConfig } from "../testing/pipelineHarness";
import { createTelegramTestKit } from "../testing/testKit";
import type { BotContext } from "./context";
import { createBot } from "./createBot";
import { UpdateProcessingError } from "./errors";
import { createInMemoryServices } from "./inMemoryServices";
import { createMemoryLogger } from "./logger";
import { sendCard } from "./presenter";
import { renderMessage, text } from "../render";

describe("createBot: API transformer wiring", () => {
  it("installs the injected transformers first, then retry, throttler and token redaction", () => {
    const kit = createTelegramTestKit();
    const services = createInMemoryServices({ config: createTestConfig(), logger: createMemoryLogger() });

    const injected: Transformer = (prev, method, payload, signal) => prev(method, payload, signal);
    const withThrottle = createBot({ services, api: { transformers: [injected, kit.fake.transformer] } });
    const withoutThrottle = createBot({
      services,
      api: { transformers: [injected, kit.fake.transformer], throttle: false },
    });

    const installed = withThrottle.api.config.installedTransformers();
    expect(installed).toHaveLength(2 + 3);
    expect(installed[0]).toBe(injected);
    expect(installed[1]).toBe(kit.fake.transformer);
    expect(withoutThrottle.api.config.installedTransformers()).toHaveLength(2 + 2);
  });

  it("makes kit.attach refuse the bot, pointing to the injection option", () => {
    const kit = createTelegramTestKit();
    const services = createInMemoryServices({ config: createTestConfig(), logger: createMemoryLogger() });
    const bot = createBot({ services });

    expect(() => kit.attach(bot)).toThrow(/createBot's api option/);
  });

  it("puts retry between the fake and the throttler: a retried call passes the throttler once", async () => {
    const throttled: string[] = [];
    const throttle: Transformer = (prev, method, payload, signal) => {
      throttled.push(method);
      return prev(method, payload, signal);
    };
    const composer = new Composer<BotContext>();
    composer.on("message:text", (ctx) => sendCard(ctx, renderMessage({ body: text("hi") })));
    const h = createPipelineHarness({ composers: [composer], throttle });
    h.kit.fake.failNext("sendMessage", fakeFailures.tooManyRequests(1));

    await h.deliver(h.kit.updates.privateText("hello"));

    expect(h.kit.fake.callsTo("sendMessage")).toHaveLength(2);
    expect(throttled).toEqual(["sendMessage"]);
    expect(h.sleeps).toEqual([1000]);
  });

  it("lets the fake answer before anything reaches the network, and never calls getMe when botInfo is given", async () => {
    const h = createPipelineHarness();

    await h.deliver(h.kit.updates.privateText("hello"));

    expect(h.kit.fake.callsTo("getMe")).toHaveLength(0);
  });
});

describe("createBot: configuration", () => {
  it("uses the configured API root for the Bot API client", () => {
    const config = parseTelegramConfig({
      TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
      TELEGRAM_BOT_USERNAME: "steza_test_bot",
      TELEGRAM_MODE: "polling",
      TELEGRAM_ENV: "test",
      TELEGRAM_API_ROOT: "http://localhost:8081",
    });
    const bot = createBot({ services: createInMemoryServices({ config, logger: createMemoryLogger() }) });

    expect(bot.api.options?.apiRoot).toBe("http://localhost:8081");
  });

  it("leaves the client at Telegram's default root when none is configured", () => {
    const bot = createBot({
      services: createInMemoryServices({ config: createTestConfig(), logger: createMemoryLogger() }),
    });

    expect(bot.api.options?.apiRoot).toBeUndefined();
  });

  it("gives every handler the same services and installs composers after the pipeline", async () => {
    const seen: unknown[] = [];
    const composer = new Composer<BotContext>();
    composer.on("message:text", (ctx) => {
      seen.push(ctx.services);
    });
    const h = createPipelineHarness({ composers: [composer] });

    await h.deliver(h.kit.updates.privateText("hello"));

    expect(seen).toEqual([h.services]);
    expect(seen[0]).toBe(h.services);
  });

  it("installs its own bot.catch: logs a redacted description through services.logger and does not rethrow", async () => {
    // errorBoundary already handled this and produced the UpdateProcessingError;
    // bot.catch is the net for whatever reaches grammY anyway (a bug, or
    // middleware installed outside createBot). Exercised directly against the
    // installed `bot.errorHandler`, which is what grammY's own polling loop
    // and @grammyjs/runner call.
    const h = createPipelineHarness();
    const cause = new GrammyError(
      "Call to 'sendMessage' failed!",
      { ok: false, error_code: 400, description: "Bad Request: chat not found" },
      "sendMessage",
      { chat_id: 1, text: "private plan text" },
    );
    const error = new UpdateProcessingError({ updateId: 1, causeCode: "telegram_bad_request", cause });
    const botError = new BotError<BotContext>(error, {} as BotContext);

    await h.bot.errorHandler(botError);

    expect(h.logger.records).toContainEqual({
      level: "error",
      event: "bot.catch",
      errorClass: "UpdateProcessingError",
      errorCode: "update_processing_failed",
      detail: "Update 1 failed (telegram_bad_request)",
    });
    expect(h.logger.serialized()).not.toContain("private plan text");
  });

  it("runs several composers in the given order", async () => {
    const order: string[] = [];
    const first = new Composer<BotContext>();
    first.use(async (_ctx, next) => {
      order.push("first");
      await next();
    });
    const second = new Composer<BotContext>();
    second.use(async (_ctx, next) => {
      order.push("second");
      await next();
    });
    const h = createPipelineHarness({ composers: [first, second] });

    await h.deliver(h.kit.updates.privateText("hello"));

    expect(order).toEqual(["first", "second"]);
  });
});
