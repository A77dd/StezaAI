import type { Composer } from "grammy";
import type { BotContext } from "../../bot";
import { answerCallback, editCard, ownerOf, targetOfCallback } from "../../bot";
import { actionButton, keyboard, renderMessage, row, text } from "../../render";
import type { RenderedMessage, ViewContext } from "../../render";
import { peekCallbackAction } from "./callbackRouting";

/**
 * `/deleteme`'s two-step confirmation card: `[Да, удалить] [Отмена]`, both
 * through `data.delete` (single-use, 15 minute TTL — see `callbacks/actions.ts`)
 * so a stale confirmation card can never be pressed twice.
 */
export function renderDeleteConfirmation(ctx: ViewContext): RenderedMessage {
  const { personal } = ctx.catalog;
  return renderMessage({
    body: text(personal.deleteConfirmQuestion),
    keyboard: keyboard(
      row(
        actionButton(personal.deleteConfirmYes, "data.delete", { decision: "confirm" }, "danger"),
        actionButton(personal.deleteConfirmCancel, "data.delete", { decision: "cancel" }),
      ),
    ),
  });
}

/** `data.delete`: confirms or cancels `/deleteme`. */
export function registerDataCallbacks(composer: Composer<BotContext>): void {
  composer.on("callback_query:data", async (ctx, next) => {
    if (peekCallbackAction(ctx.callbackQuery.data) !== "data.delete") {
      await next();
      return;
    }

    // Answer immediately for idempotency
    await answerCallback(ctx);

    const owner = ownerOf(ctx);
    const resolved = await ctx.services.callbacks.resolve(ctx.callbackQuery.data, owner);
    if (resolved.action !== "data.delete") {
      throw new Error("data.delete handler resolved a different action");
    }
    const target = targetOfCallback(ctx);
    // No settings load: `/deleteme` may be removing them this very update, and
    // the confirmation/cancellation text needs none.
    const viewCtx = ctx.viewContext(null);

    if (resolved.payload.decision === "cancel") {
      await editCard(ctx, target, renderMessage({ body: text(viewCtx.catalog.personal.deleteCancelled) }));
      return;
    }

    await ctx.services.personalFlow.deleteUserData({ userId: owner.userId });
    await editCard(ctx, target, renderMessage({ body: text(viewCtx.catalog.personal.deleteConfirmed) }));
  });
}
