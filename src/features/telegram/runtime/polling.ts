import { run } from "@grammyjs/runner";
import type { RunnerHandle, RunnerOptions } from "@grammyjs/runner";
import type { Bot } from "grammy";
import type { BotContext, Logger } from "@/features/telegram/bot";
import type { TelegramConfig } from "@/features/telegram/config";
import { ALLOWED_UPDATES } from "@/features/telegram/bot/allowedUpdates";

export type PollingHandle = {
  readonly bot: Bot<BotContext>;
  /** Stops fetching and resolves when the in-flight update has finished. */
  stop(): Promise<void>;
};

export type StartPollingOptions = {
  readonly bot: Bot<BotContext>;
  readonly config: TelegramConfig;
  readonly logger: Logger;
  readonly runnerOptions?: RunnerOptions;
};

/**
 * The local long-polling runtime (ADR 0003): brings the bot online with the
 * runner plugin, which keeps long-polling through network failures. The
 * startup sequence is deliberate: `getMe` first (skipped when the host preset
 * `botInfo`), then a hard identity check — a token that answers for a
 * different username than the configuration would silently break mention and
 * command detection, so it fails loudly instead — then `deleteWebhook` (the
 * runner does not do it itself, and a set webhook would swallow every
 * `getUpdates` batch), then polling with the repo's explicit
 * `ALLOWED_UPDATES`.
 *
 * This runtime keeps every adapter in memory: callback tokens, drafts,
 * reminders and dedupe state reset when the process exits, so it must not be
 * presented as production-ready (ADR 0003).
 */
export async function startPolling(options: StartPollingOptions): Promise<PollingHandle> {
  const { bot, config, logger } = options;

  if (!bot.isInited()) await bot.init();
  const username = bot.botInfo.username;
  if (username.toLowerCase() !== config.botUsername.toLowerCase()) {
    throw new Error(
      `polling: getMe returned @${username} but the configuration expects @${config.botUsername}; fix TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_USERNAME`,
    );
  }

  await bot.api.deleteWebhook({ drop_pending_updates: true });

  const handle: RunnerHandle = run(bot, {
    runner: {
      ...options.runnerOptions,
      fetch: {
        allowed_updates: [...ALLOWED_UPDATES],
        ...options.runnerOptions?.fetch,
      },
    },
  });
  logger.info("bot.polling_started", { username });

  const stop = async (): Promise<void> => {
    await handle.stop();
    logger.info("bot.polling_stopped", { username });
  };

  return { bot, stop };
}
