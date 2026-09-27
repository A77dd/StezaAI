import type { MiddlewareFn } from "grammy";
import { updateLogBindings } from "../context";
import type { BotContext } from "../context";

/**
 * Finishes the context with what needs I/O: the reply language and the
 * update-scoped logger (update kind, chat type; nothing that identifies a
 * person).
 *
 * Product decision (2026-09-27): the pilot speaks Russian only, so the locale
 * stays what the constructor set ("ru") no matter what the stored settings or
 * the client's `language_code` say. The catalogs stay bilingual; re-enable
 * `settings.locale` here (and `deriveLocale` in the constructor) to lift it.
 */
export function enrichContext(): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    // Warm the settings cache even though the locale no longer comes from it:
    // handlers read `ctx.loadSettings()` once per update.
    await ctx.loadSettings();
    ctx.locale = "ru";
    ctx.log = ctx.log.child(updateLogBindings(ctx));
    await next();
  };
}
