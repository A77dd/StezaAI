import { Composer } from "grammy";
import type { BotContext } from "../bot";

/**
 * The bot's handlers as one composer, installed after the pipeline
 * middleware. Empty for now: personal flow (task 7), forwards and voice
 * (task 8), groups (task 9), inline mode (task 10) and reminders (task 11)
 * register here. Handlers take what they need from `ctx.services`, so the
 * composer needs no arguments.
 */
export function createHandlers(): Composer<BotContext> {
  return new Composer<BotContext>();
}
