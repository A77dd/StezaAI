import { Composer } from "grammy";
import type { BotContext } from "../bot";
import { registerGroupFlow } from "./group";
import { registerPersonalFlow } from "./personal";

/**
 * The bot's handlers as one composer, installed after the pipeline
 * middleware. Personal flow (task 7) and groups (task 9) are wired below;
 * inline mode (task 10) and reminders (task 11) register here too, once
 * built. Handlers take what they need from `ctx.services`, so the composer
 * needs no arguments.
 */
export function createHandlers(): Composer<BotContext> {
  const composer = new Composer<BotContext>();
  composer.use(registerPersonalFlow());
  composer.use(registerGroupFlow());
  return composer;
}
