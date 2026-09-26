import type { MiddlewareFn } from "grammy";
import type { BotContext } from "../context";
import { classifyTelegramError } from "../telegramErrors";
import { isDuplicateUpdate } from "./dedupe";

/**
 * Telegram shows a spinner on the pressed button until the callback query is
 * answered, and a second answer is rejected. This middleware makes "answered
 * exactly once" a property of the pipeline instead of a habit of every handler.
 */

type AnswerState = "idle" | "answering" | "answered";

const states = new WeakMap<object, AnswerState>();

/** Whether the update's callback query has been answered (or found stale) by now. */
export function hasAnsweredCallback(ctx: BotContext): boolean {
  return states.get(ctx) === "answered";
}

/**
 * Wraps `ctx.answerCallbackQuery` so that:
 * - the first answer goes through; a second one is suppressed and logged
 *   (`callback.answered_twice`), because Telegram would reject it;
 * - "query is too old" / "query ID is invalid" is logged
 *   (`callback.answer_stale`) and counts as answered: that failure is
 *   permanent (a slow update, or a redelivery of an answered query), so
 *   failing the whole update over it would only cause pointless retries.
 *   Every other failure propagates;
 * - a failed attempt leaves the query unanswered so the error boundary can
 *   still answer it.
 *
 * Only `ctx.answerCallbackQuery` is guarded: handlers must not call
 * `ctx.api.answerCallbackQuery` directly.
 */
function guardAnswers(ctx: BotContext): void {
  states.set(ctx, "idle");
  const answer = ctx.answerCallbackQuery.bind(ctx);
  ctx.answerCallbackQuery = async (other, signal) => {
    if (states.get(ctx) !== "idle") {
      ctx.log.warn("callback.answered_twice");
      return true;
    }
    states.set(ctx, "answering");
    try {
      const result = await answer(other, signal);
      states.set(ctx, "answered");
      return result;
    } catch (error) {
      if (classifyTelegramError(error) === "query_too_old") {
        ctx.log.warn("callback.answer_stale");
        states.set(ctx, "answered");
        return true;
      }
      states.set(ctx, "idle");
      throw error;
    }
  };
}

/**
 * Guards the callback answer and, if the handlers finished without answering,
 * answers with no text so the spinner stops (`callback.unanswered` warns that
 * a handler forgot). When the handlers throw, nothing is answered here: the
 * error boundary, which sits outside, answers with a user-safe notice.
 */
export function callbackAnswers(): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    if (ctx.callbackQuery === undefined) {
      await next();
      return;
    }
    guardAnswers(ctx);
    await next();
    if (states.get(ctx) === "idle" && !isDuplicateUpdate(ctx)) {
      ctx.log.warn("callback.unanswered");
      await ctx.answerCallbackQuery();
    }
  };
}
