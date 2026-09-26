import { sequentialize as sequentializeByKey } from "@grammyjs/runner";
import type { MiddlewareFn } from "grammy";
import type { BotContext } from "../context";

/**
 * The key updates are ordered by: the chat, or the user when the update has no
 * chat (inline queries, chosen inline results, callbacks of inline messages)
 * or happened in a chat the bot is not part of (a guest message). Ids are used
 * as they are on purpose: a private chat id equals its user's id, so a user's
 * inline queries are ordered with their private chat, which is what "the same
 * person acting in sequence" means. Group ids are negative and cannot collide.
 */
export function orderingKeyOf(ctx: BotContext): string | undefined {
  const id = ctx.update.guest_message === undefined ? (ctx.chat?.id ?? ctx.from?.id) : ctx.from?.id;
  return id === undefined ? undefined : String(id);
}

/**
 * Processes updates of one chat one after another, so a fast second message
 * cannot overtake a slow first one (a confirmation before its proposal, a
 * "cancel" before the thing it cancels). Updates of different chats still run
 * in parallel.
 *
 * Per process only: the chains live in memory. With several instances
 * (serverless, several webhook workers) ordering per chat must be enforced
 * where updates are queued, by the inbox that claims "no earlier unprocessed
 * update of this chat" (research 4.2, "Порядок по чату").
 */
export function sequentialize(): MiddlewareFn<BotContext> {
  return sequentializeByKey<BotContext>(orderingKeyOf);
}
