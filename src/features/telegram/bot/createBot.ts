import { Bot } from "grammy";
import type { Composer, Transformer } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { createBotContextClass } from "./context";
import type { BotContext } from "./context";
import type { Sleep } from "./boundedRetry";
import { callbackAnswers } from "./middleware/callbackAnswers";
import { dedupe } from "./middleware/dedupe";
import { enrichContext } from "./middleware/enrichContext";
import { errorBoundary } from "./middleware/errorBoundary";
import { logging } from "./middleware/logging";
import { sequentialize } from "./middleware/sequentialize";
import { installOutboundPolicy, realSleep } from "./outbound";
import type { BotServices } from "./services";

export type CreateBotOptions = {
  /** Ports, and the configuration (`services.config`), the single source of truth. */
  readonly services: BotServices;
  readonly api?: {
    /**
     * Installed FIRST, so they sit closest to the network. A test hands the
     * fake Bot API here (`kit.fake.transformer`): the fake answers instead of
     * calling out, so the retry and throttling below wrap it and behave as
     * they do in production. (`TelegramTestKit.attach` refuses a bot that
     * already has transformers, which is why it cannot be used after this.)
     */
    readonly transformers?: readonly Transformer[];
    /** How retries wait. Default: a real timer. Tests inject a recorder. */
    readonly sleep?: Sleep;
    /** `false` switches the throttler off (tests); a transformer replaces it. Default: `apiThrottler`. */
    readonly throttle?: false | Transformer;
  };
  /** Known bot identity; without it the runtime must call `bot.init()` before handling updates. */
  readonly botInfo?: UserFromGetMe;
  /**
   * Handler composers, installed after the pipeline middleware. This layer
   * does not import `handlers/` (they depend on it, not the other way round);
   * `createTelegramBot` passes the real ones.
   */
  readonly composers?: readonly Composer<BotContext>[];
};

/**
 * Builds the bot: the `Bot` with the pipeline middleware and outbound policy
 * around whatever composers are given.
 *
 * API transformers, in the order installed (innermost first): the injected
 * ones (network or fake), `boundedRetry`, the throttler, token redaction.
 *
 * Middleware, outermost first, and why in this order:
 * 1. `logging`: one record per update, wraps everything, including failures.
 * 2. `errorBoundary`: the single catch; turns any failure into one user
 *    notice and an `UpdateProcessingError`.
 * 3. `callbackAnswers`: guards `answerCallbackQuery` so it happens once; sits
 *    inside the boundary so the boundary can still answer a failed callback.
 * 4. `dedupe`: drops redelivered updates before any work is queued.
 * 5. `sequentialize`: orders updates per chat; after dedupe so a duplicate
 *    never waits in a chat's queue.
 * 6. `enrichContext`: loads settings for the language; needs no ordering above it.
 * 7. the handler composers.
 *
 * Errors reach the runtime wrapped by grammY in a `BotError` whose `.error` is
 * the `UpdateProcessingError`; `createBot` sets no `bot.catch`, the runtime
 * (webhook inbox, polling runner) owns retry policy.
 */
export function createBot(options: CreateBotOptions): Bot<BotContext> {
  const { services } = options;
  const { config, logger } = services;

  const bot = new Bot<BotContext>(config.token, {
    ContextConstructor: createBotContextClass(services),
    ...(config.apiRoot === undefined ? {} : { client: { apiRoot: config.apiRoot } }),
    ...(options.botInfo === undefined ? {} : { botInfo: options.botInfo }),
  });

  bot.api.config.use(...(options.api?.transformers ?? []));
  installOutboundPolicy(bot, {
    retry: {
      sleep: options.api?.sleep ?? realSleep,
      onRetry: (info) => logger.warn("outbound.retry", info),
    },
    ...(options.api?.throttle === undefined ? {} : { throttle: options.api.throttle }),
  });

  bot.use(logging(), errorBoundary(), callbackAnswers(), dedupe(), sequentialize(), enrichContext());
  for (const composer of options.composers ?? []) bot.use(composer);
  return bot;
}
