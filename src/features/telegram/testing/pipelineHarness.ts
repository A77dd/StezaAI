import { BotError } from "grammy";
import { Composer } from "grammy";
import type { Bot, Transformer } from "grammy";
import type { Update } from "grammy/types";
import { createInMemoryCallbackStore, createSequentialTokenGenerator } from "../callbacks";
import { createSequentialIdGenerator } from "../adapters/idGenerator";
import { UpdateProcessingError, createBot, createInMemoryServices, createMemoryLogger } from "../bot";
import type { BotContext, BotServices, MemoryLogger } from "../bot";
import { parseTelegramConfig } from "../config";
import type { TelegramConfig } from "../config";
import { createTelegramTestKit } from "./testKit";
import type { TelegramTestKit, TelegramTestKitOptions } from "./testKit";

// A placeholder that has the shape of a bot token; it is not a credential.
export const TEST_BOT_TOKEN = "123456789:TEST_TOKEN_PLACEHOLDER_aaaaaaaaaaaaaaaaaaaaaaaa";

export function createTestConfig(): TelegramConfig {
  return parseTelegramConfig({
    TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
    TELEGRAM_BOT_USERNAME: "steza_test_bot",
    TELEGRAM_MODE: "polling",
    TELEGRAM_ENV: "test",
  });
}

export type PipelineHarnessOptions = {
  /** Handlers that run after the pipeline middleware. */
  readonly composers?: readonly Composer<BotContext>[];
  readonly kit?: TelegramTestKitOptions;
  /** Replaces default services (which are in-memory, with the kit's clock and sequential ids/tokens). */
  readonly services?: Partial<Omit<BotServices, "config" | "logger">>;
  /**
   * The throttler waits with real timers, so it is off unless a test is
   * about it. Pass a transformer to observe or replace it.
   */
  readonly throttle?: false | Transformer;
};

/**
 * A real `createBot` pipeline on top of the fake Bot API, with a memory
 * logger, deterministic services and a recording `sleep` (retries never wait
 * in real time). The fake is installed through `createBot`'s `api` option so
 * it is the innermost transformer, as the kit requires.
 */
export function createPipelineHarness(options: PipelineHarnessOptions = {}) {
  const kit: TelegramTestKit = createTelegramTestKit(options.kit);
  const logger: MemoryLogger = createMemoryLogger();
  const sleeps: number[] = [];
  const services = createInMemoryServices({
    config: createTestConfig(),
    logger,
    clock: kit.clock,
    ids: createSequentialIdGenerator(),
    callbacks: createInMemoryCallbackStore({ clock: kit.clock, tokens: createSequentialTokenGenerator() }),
    ...options.services,
  });
  const bot: Bot<BotContext> = createBot({
    services,
    botInfo: kit.botInfo,
    composers: options.composers,
    api: {
      transformers: [kit.fake.transformer],
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      throttle: options.throttle ?? false,
    },
  });
  return {
    kit,
    bot,
    services,
    logger,
    /** Every wait the retry policy asked for, in milliseconds. */
    sleeps,
    deliver: (update: Update) => kit.deliver(bot, update),
    /**
     * Delivers an update that must fail and returns the error the runtime
     * would see. grammY wraps it in a `BotError`; anything else is a test failure.
     */
    async deliverExpectingFailure(update: Update): Promise<UpdateProcessingError> {
      try {
        await kit.deliver(bot, update);
      } catch (error) {
        if (error instanceof BotError && error.error instanceof UpdateProcessingError) return error.error;
        throw error;
      }
      throw new Error("expected the update to fail, but it was handled");
    },
  };
}

export type PipelineHarness = ReturnType<typeof createPipelineHarness>;

/** A harness whose only handler runs `action` for every update. */
export function createHandlerHarness(
  action: (ctx: BotContext) => Promise<void>,
  options: Omit<PipelineHarnessOptions, "composers"> = {},
): PipelineHarness {
  const composer = new Composer<BotContext>();
  composer.use(async (ctx) => {
    await action(ctx);
  });
  return createPipelineHarness({ ...options, composers: [composer] });
}

export type Deferred = {
  readonly promise: Promise<void>;
  resolve(): void;
};

/** A promise a test settles by hand, to hold a handler at a chosen point. */
export function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/**
 * Lets everything that can run without a timer run: pending promise
 * callbacks, including the middleware chain. Used instead of sleeping.
 */
export async function flushMicrotasks(rounds = 200): Promise<void> {
  for (let round = 0; round < rounds; round += 1) await Promise.resolve();
}
