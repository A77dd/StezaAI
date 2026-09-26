import type { MiddlewareFn } from "grammy";
import { parseInstant } from "../../domain";
import { updateLogBindings } from "../context";
import type { BotContext } from "../context";
import { isDuplicateUpdate } from "./dedupe";

/**
 * Writes exactly one `update.processed` record per update, whatever happened:
 * `{ updateId, updateKind, chatType, outcome, durationMs }` with outcome
 * `handled`, `duplicate` or `failed`. It is the outermost middleware, so the
 * duration covers the whole pipeline; time comes from the injected clock, so
 * tests advance it instead of sleeping. Failures are not caught here (the
 * record is written in `finally`); the error boundary reports the error.
 */
export function logging(): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const { clock } = ctx.services;
    const startedAt = parseInstant(clock.now());
    let outcome: "handled" | "duplicate" | "failed" = "failed";
    try {
      await next();
      outcome = isDuplicateUpdate(ctx) ? "duplicate" : "handled";
    } finally {
      ctx.log.info("update.processed", {
        ...updateLogBindings(ctx),
        outcome,
        durationMs: parseInstant(clock.now()) - startedAt,
      });
    }
  };
}
