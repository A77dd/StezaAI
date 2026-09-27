import type { Composer } from "grammy";
import type { BotContext } from "../../bot";
import { answerCallback, ownerOf, sendCard, targetOfCallback } from "../../bot";
import { askInputView } from "../../render";
import { peekCallbackAction } from "./callbackRouting";

/**
 * `task.edit`: asks "what to change?" and remembers both the prompt (for
 * `PendingInputRepository`, via `beginTaskEdit`) and the ORIGINAL card message
 * (so the reply, once it arrives, can refresh that same card instead of
 * sending a new one — see `handlers/personal/pendingInput.ts`).
 */
export function registerTaskEditCallback(composer: Composer<BotContext>): void {
  composer.on("callback_query:data", async (ctx, next) => {
    if (peekCallbackAction(ctx.callbackQuery.data) !== "task.edit") {
      await next();
      return;
    }
    await handleTaskEdit(ctx, ctx.callbackQuery.data);
  });
}

async function handleTaskEdit(ctx: BotContext, data: string): Promise<void> {
  // Answer immediately for idempotency
  await answerCallback(ctx);

  const owner = ownerOf(ctx);
  const resolved = await ctx.services.callbacks.resolve(data, owner);
  if (resolved.action !== "task.edit") throw new Error("task.edit handler resolved a different action");
  const target = targetOfCallback(ctx);
  if (target.kind !== "chat") {
    // No inline task cards exist in this task; a foreign target is a bug, not
    // a user-facing condition.
    throw new Error("task.edit: the task card is not a chat message");
  }
  const viewCtx = ctx.viewContext(await ctx.loadSettings());

  const prompt = await sendCard(ctx, askInputView({ kind: "task_edit" }, viewCtx));
  await ctx.services.personalFlow.beginTaskEdit({
    userId: owner.userId,
    chatId: target.chatId,
    taskId: resolved.payload.taskId,
    promptMessageId: prompt.message_id,
  });
  ctx.services.promptTracker.remember(owner.userId, target.chatId, {
    promptMessageId: prompt.message_id,
    purpose: "task_edit",
    cardMessageId: target.messageId,
  });
}
