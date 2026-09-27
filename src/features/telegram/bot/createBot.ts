import { Bot } from "grammy";
import type { Composer, Transformer } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { createBotContextClass } from "./context";
import type { BotContext } from "./context";
import type { Sleep } from "./boundedRetry";
import { describeError } from "./errors";
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
 * 3. `callbackAnswers`: guards `answerCallbackQuery` so it happens once, and,
 *    after the handlers return, auto-answers a callback nobody answered. It
 *    sits INSIDE `errorBoundary` (not outside) so that if that automatic
 *    answer itself fails, the failure still reaches the one catch instead of
 *    escaping the pipeline unlogged and unreported. `ctx.answerCallbackQuery`
 *    is guarded wherever it is called from (the guard lives on `ctx`, not on
 *    this middleware's position), so ordering here is only about that
 *    auto-answer call.
 * 4. `dedupe`: drops redelivered updates before any work is queued. It must
 *    run before `sequentialize`: otherwise a redelivery of a chat's slow,
 *    still-processing update would queue behind it instead of being rejected
 *    immediately (see `pipeline.middlewareOrder.test.ts`).
 * 5. `sequentialize`: orders updates per chat.
 * 6. `enrichContext`: loads settings for the language; needs no ordering above it.
 * 7. the handler composers.
 *
 * Errors reach the runtime wrapped by grammY in a `BotError` whose `.error` is
 * the `UpdateProcessingError`. `createBot` still installs `bot.catch`, as a
 * last-resort net: `errorBoundary` should already have logged and rethrown
 * every failure, but if it is somehow bypassed (a bug in this pipeline, or
 * middleware installed after `createBot` returns), grammY's own default
 * handler would `console.error` the raw error — a `GrammyError` carries the
 * outgoing request, i.e. message text, which must never reach an
 * unstructured log. `bot.catch` here logs the same redacted description
 * through `services.logger` instead and does not rethrow.
 *
 * This changes host behaviour: for `bot.start()`'s built-in long polling, the
 * default handler stops the bot on any error; this one does not. For
 * `@grammyjs/runner`, the default only prints twice (once from grammY, once
 * from the runner's own fallback) without stopping; this one logs once. A
 * webhook host never goes through `bot.catch` at all (`webhookCallback` calls
 * `bot.handleUpdate` directly), so it needs its own try/catch around the
 * handoff — a Task 12 concern.
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

  // Last-resort net; see the doc comment above for why this exists and does
  // not rethrow.
  bot.catch((error) => {
    logger.error("bot.catch", describeError(error.error));
  });

  return bot;
}
