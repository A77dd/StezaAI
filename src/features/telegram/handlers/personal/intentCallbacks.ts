import type { Composer } from "grammy";
import type { IntentKind } from "../../domain";
import type { BotContext } from "../../bot";
import { answerCallback, editCard, ownerOf, targetOfCallback } from "../../bot";
import { noticeForKind, renderMessage, text } from "../../render";
import type { ViewContext } from "../../render";
import { peekCallbackAction } from "./callbackRouting";
import { proposalCard } from "./outcomes";

/**
 * `intent.choose` (the personal clarify chooser) and `context.choose` with
 * `{ choice: "remember" }` (the `info_only` "just remember" button): both
 * resolve through `chooseIntent`. `context.choose` with `personal`/`group` is
 * the group flow's own concern (Task 9) and is left to `next()`.
 */
export function registerIntentCallbacks(composer: Composer<BotContext>): void {
  composer.on("callback_query:data", async (ctx, next) => {
    if (peekCallbackAction(ctx.callbackQuery.data) !== "intent.choose") {
      await next();
      return;
    }
    await handleIntentChoose(ctx, ctx.callbackQuery.data);
  });

  composer.on("callback_query:data", async (ctx, next) => {
    if (peekCallbackAction(ctx.callbackQuery.data) !== "context.choose") {
      await next();
      return;
    }
    const owner = ownerOf(ctx);
    const resolved = await ctx.services.callbacks.resolve(ctx.callbackQuery.data, owner);
    if (resolved.action !== "context.choose") throw new Error("context.choose handler resolved a different action");
    if (resolved.payload.choice !== "remember") {
      // "personal" / "group": the group flow's own chooser (Task 9), not ours.
      await next();
      return;
    }
    await applyChooseIntent(ctx, owner.userId, resolved.payload.draftId, "info");
  });
}

async function handleIntentChoose(ctx: BotContext, data: string): Promise<void> {
  // Answer immediately for idempotency
  await answerCallback(ctx);

  const owner = ownerOf(ctx);
  const resolved = await ctx.services.callbacks.resolve(data, owner);
  if (resolved.action !== "intent.choose") throw new Error("intent.choose handler resolved a different action");
  await applyChooseIntent(ctx, owner.userId, resolved.payload.draftId, resolved.payload.kind);
}

async function applyChooseIntent(ctx: BotContext, userId: string, draftId: string, kind: IntentKind): Promise<void> {
  const target = targetOfCallback(ctx);
  const viewCtx: ViewContext = ctx.viewContext(await ctx.loadSettings());

  const result = await ctx.services.personalFlow.chooseIntent({ userId, draftId, kind });

  switch (result.kind) {
    case "draft_not_found": {
      const notice = noticeForKind("expired", viewCtx);
      await editCard(ctx, target, notice.message);
      return;
    }
    case "noted": {
      await editCard(ctx, target, renderMessage({ body: text(viewCtx.catalog.checkIn.recorded) }));
      return;
    }
    case "proposed":
    case "no_slots": {
      await editCard(ctx, target, proposalCard(result, viewCtx));
    }
  }
}
