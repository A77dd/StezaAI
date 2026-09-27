import type { BotContext } from "../../bot";
import { editCard, sendCard } from "../../bot";
import { fill, noticeForKind, renderMessage, settingsView, text } from "../../render";
import type { RenderedMessage, ViewContext } from "../../render";
import { proposalCard, sendSubmitOutcome } from "./outcomes";

/**
 * Applies a plain-text reply to whatever the bot last asked this chat for
 * (Task 7: a timezone, a task correction, or new working hours). Returns
 * `true` when there was a pending prompt to answer, so the text must not also
 * be treated as a new task; `false` when there was none, so the caller should
 * fall through to `submitText`.
 *
 * `PromptTracker` (`ctx.services.promptTracker`) only remembers WHICH message
 * the chat is waiting on and WHAT it is for; the actual validity check
 * (ownership, expiry, single application) is `PendingInputRepository`'s job,
 * so a stale tracker entry (the underlying row already expired or was
 * consumed) is reported as an expired prompt, never silently ignored.
 */
export async function tryApplyPendingInput(
  ctx: BotContext,
  userId: string,
  chatId: number,
  messageText: string,
): Promise<boolean> {
  const remembered = ctx.services.promptTracker.take(userId, chatId);
  if (remembered === undefined) return false;

  const viewCtx = ctx.viewContext(await ctx.loadSettings());

  switch (remembered.purpose) {
    case "timezone":
      await applyTimezone(ctx, userId, chatId, remembered.promptMessageId, messageText, viewCtx);
      return true;
    case "working_hours":
      await applyWorkingHours(ctx, userId, chatId, remembered.promptMessageId, remembered.cardMessageId, messageText, viewCtx);
      return true;
    case "task_edit":
      await applyTaskEditReply(ctx, userId, chatId, remembered.promptMessageId, remembered.cardMessageId, messageText, viewCtx);
      return true;
  }
}

async function applyTimezone(
  ctx: BotContext,
  userId: string,
  chatId: number,
  promptMessageId: number,
  reply: string,
  viewCtx: ViewContext,
): Promise<void> {
  const pending = await ctx.services.pendingInputs.takeByPrompt(userId, chatId, promptMessageId);
  if (pending === null || pending.purpose !== "timezone") {
    await sendCard(ctx, noticeForKind("expired", viewCtx).message);
    return;
  }
  const result = await ctx.services.personalFlow.setTimezone({ userId, tz: reply, draftId: pending.refId });
  if (result.kind === "timezone_set") {
    const confirmation = fill(viewCtx.catalog.personal.timezoneConfirmed, { tz: text(result.settings.timezone) });
    await sendCard(ctx, renderMessage({ body: confirmation }));
    return;
  }
  await sendSubmitOutcome(ctx, userId, result, viewCtx);
}

async function applyWorkingHours(
  ctx: BotContext,
  userId: string,
  chatId: number,
  promptMessageId: number,
  cardMessageId: number | undefined,
  reply: string,
  viewCtx: ViewContext,
): Promise<void> {
  const pending = await ctx.services.pendingInputs.takeByPrompt(userId, chatId, promptMessageId);
  if (pending === null || pending.purpose !== "working_hours") {
    await sendCard(ctx, noticeForKind("expired", viewCtx).message);
    return;
  }
  const settings = await ctx.services.personalFlow.setWorkingHours({ userId, text: reply });
  const rendered = settingsView(settings, viewCtx);
  if (cardMessageId === undefined) {
    await sendCard(ctx, rendered);
    return;
  }
  await editCard(ctx, { kind: "chat", chatId, messageId: cardMessageId }, rendered);
}

async function applyTaskEditReply(
  ctx: BotContext,
  userId: string,
  chatId: number,
  promptMessageId: number,
  cardMessageId: number | undefined,
  reply: string,
  viewCtx: ViewContext,
): Promise<void> {
  const result = await ctx.services.personalFlow.applyTaskEdit({ userId, chatId, promptMessageId, text: reply });
  if (result.kind === "no_pending_edit") {
    await sendCard(ctx, noticeForKind("expired", viewCtx).message);
    return;
  }
  let rendered: RenderedMessage;
  if (result.kind === "nothing_changed") {
    const retryable = await ctx.services.personalFlow.getRetryableProposal({ userId, taskId: result.task.id });
    rendered = retryable === null
      ? renderMessage({ body: text(viewCtx.catalog.personal.taskEditNoChange) })
      : proposalCard({ kind: "proposed", ...retryable }, viewCtx);
  } else {
    rendered = proposalCard(result, viewCtx);
  }
  if (cardMessageId === undefined) {
    // Should not happen (the card message id is always remembered alongside
    // the prompt), but a missing one is not a reason to lose the outcome.
    await sendCard(ctx, rendered);
    return;
  }
  await editCard(ctx, { kind: "chat", chatId, messageId: cardMessageId }, rendered);
}
