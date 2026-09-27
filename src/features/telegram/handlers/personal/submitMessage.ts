import { addMinutes, PENDING_INPUT_TTL_MINUTES } from "../../domain";
import type { Instant, SourceRef } from "../../domain";
import type { BotContext } from "../../bot";
import { sendCard } from "../../bot";
import { askInputView } from "../../render";
import { sendSubmitOutcome } from "./outcomes";

export async function submitMessage(
  ctx: BotContext,
  input: { readonly text: string; readonly source: SourceRef; readonly dateTimeHints: readonly Instant[] },
): Promise<void> {
  if (ctx.from === undefined || ctx.chat === undefined) throw new Error("Personal message requires sender and chat");
  const userId = String(ctx.from.id);
  const chatId = ctx.chat.id;
  await ctx.services.personalFlow.startUser({ userId, locale: ctx.locale });
  const result = await ctx.services.personalFlow.submitText({ userId, chatId, ...input });
  if (result.kind === "timezone_required") {
    const viewCtx = ctx.viewContext(await ctx.loadSettings());
    const prompt = await sendCard(ctx, askInputView({ kind: "timezone" }, viewCtx));
    await ctx.services.pendingInputs.save({
      userId,
      chatId,
      promptMessageId: prompt.message_id,
      purpose: "timezone",
      refId: result.draftId,
      expiresAt: addMinutes(ctx.services.clock.now(), PENDING_INPUT_TTL_MINUTES),
    });
    ctx.services.promptTracker.remember(userId, chatId, { promptMessageId: prompt.message_id, purpose: "timezone" });
    return;
  }
  await sendSubmitOutcome(ctx, userId, result, ctx.viewContext(await ctx.loadSettings()));
}
