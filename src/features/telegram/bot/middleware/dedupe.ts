import type { MiddlewareFn } from "grammy";
import type { BotContext } from "../context";

const duplicates = new WeakSet<object>();

/** Whether `dedupe` dropped this update as a redelivery. */
export function isDuplicateUpdate(ctx: BotContext): boolean {
  return duplicates.has(ctx);
}

/**
 * Handles each `update_id` once. Telegram redelivers an update when the
 * webhook answers late or not with 2xx, and long polling can resend the last
 * batch; without this a redelivery would book two calendar blocks.
 *
 * Timing: the id is CLAIMED BEFORE the handlers run and RELEASED if they
 * fail. Claiming first gives at-most-once side effects for a redelivery that
 * arrives while the first attempt is still running (the usual webhook-timeout
 * case); releasing on failure lets the runtime's retry reprocess an update
 * whose handling threw, instead of dropping it as a "duplicate" of a failed
 * attempt. Marking only at the end would let both deliveries run at once.
 * Trade-off: a process that dies mid-update leaves the id claimed; the
 * in-memory store forgets it with the process, a durable store must expire
 * claims (see `UpdateDeduper`).
 *
 * A dropped duplicate is logged (`update.duplicate`) and flagged so the
 * callback guard does not answer it: the first delivery owns the answer.
 */
export function dedupe(): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const { deduper } = ctx.services;
    const { update_id: updateId } = ctx.update;
    if ((await deduper.claim(updateId)) === "duplicate") {
      duplicates.add(ctx);
      ctx.log.info("update.duplicate");
      return;
    }
    let handled = false;
    try {
      await next();
      handled = true;
    } finally {
      if (!handled) await deduper.release(updateId);
    }
  };
}
