import type { Composer } from "grammy";
import type { BotContext } from "../../bot";
import { answerCallback, editCard, ownerOf, targetOfCallback } from "../../bot";
import { welcomeProvidersRichView, welcomeRichView } from "../../render";
import { peekCallbackAction } from "./callbackRouting";

/**
 * The Rich welcome card's in-body buttons (Bot API 10.3): "Подключить
 * календарь" opens the provider choice in the same message, a provider press
 * connects it and re-renders the connected state, and "‹ Назад" returns to
 * the main card. Every press: answer → re-render the same message (fresh
 * tokens included), the pattern the rich-buttons ecosystem is built on.
 */
export function registerWelcomeCallbacks(composer: Composer<BotContext>): void {
  composer.on("callback_query:data", async (ctx, next) => {
    const action = peekCallbackAction(ctx.callbackQuery.data);
    if (action !== "welcome.providers" && action !== "welcome.main" && action !== "welcome.connect") {
      await next();
      return;
    }

    await answerCallback(ctx);
    const owner = ownerOf(ctx);
    const resolved = await ctx.services.callbacks.resolve(ctx.callbackQuery.data, owner);
    if (resolved.action !== action) throw new Error("welcome handler resolved a different action");
    const target = targetOfCallback(ctx);
    const viewCtx = ctx.viewContext(await ctx.loadSettings());

    if (resolved.action === "welcome.connect") {
      const settings = await ctx.services.personalFlow.setCalendarConnected({
        userId: owner.userId,
        connected: true,
      });
      const viewCtxConnected = ctx.viewContext(settings);
      await editCard(ctx, target, welcomeRichView({ firstName: ctx.from?.first_name ?? null, calendarConnected: settings.calendarConnected }, viewCtxConnected));
      return;
    }

    const settings = await ctx.services.settings.get(owner.userId);
    const connected = settings?.calendarConnected ?? false;
    const rendered =
      resolved.action === "welcome.providers"
        ? welcomeProvidersRichView({ firstName: ctx.from?.first_name ?? null, calendarConnected: connected }, viewCtx)
        : welcomeRichView({ firstName: ctx.from?.first_name ?? null, calendarConnected: connected }, viewCtx);
    await editCard(ctx, target, rendered);
  });
}
