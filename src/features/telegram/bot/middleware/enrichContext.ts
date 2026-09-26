import type { MiddlewareFn } from "grammy";
import { updateLogBindings } from "../context";
import type { BotContext } from "../context";

/**
 * Finishes the context with what needs I/O: the reply language. It is the
 * stored `settings.locale`, and only without stored settings the language
 * derived from Telegram's `language_code` (`deriveLocale`, which is already
 * in `ctx.locale` from construction). It also gives handlers a logger that
 * knows the update kind and chat type. Nothing here identifies a person.
 */
export function enrichContext(): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const settings = await ctx.loadSettings();
    if (settings !== null) ctx.locale = settings.locale;
    ctx.log = ctx.log.child(updateLogBindings(ctx));
    await next();
  };
}
