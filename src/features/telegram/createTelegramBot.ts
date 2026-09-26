import type { Bot } from "grammy";
import { createBot } from "./bot";
import type { BotContext, CreateBotOptions } from "./bot";
import { createHandlers } from "./handlers";

/**
 * The composition root of the Telegram layer: the pipeline from `bot/` with
 * the real handlers from `handlers/`. Hosts (webhook route, polling runner,
 * demos) call this. It exists because `bot/` must not import `handlers/`
 * (handlers depend on the bot layer's context and presenter); tests of the
 * pipeline itself use `createBot` with their own composers.
 */
export function createTelegramBot(options: Omit<CreateBotOptions, "composers">): Bot<BotContext> {
  return createBot({ ...options, composers: [createHandlers()] });
}
