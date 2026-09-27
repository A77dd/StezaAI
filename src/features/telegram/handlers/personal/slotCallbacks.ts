import type { Composer } from "grammy";
import { NotFoundError } from "../../domain";
import type { BotContext } from "../../bot";
import { answerCallback, editCard, ownerOf, targetOfCallback } from "../../bot";
import { noticeForKind, taskProposalView } from "../../render";
import type { ViewContext } from "../../render";
import { peekCallbackAction } from "./callbackRouting";
import { proposalCard } from "./outcomes";

/** `slot.pick`: confirms a proposed slot, and `slot.other`: proposes fresh ones. */
export function registerSlotCallbacks(composer: Composer<BotContext>): void {
  composer.on("callback_query:data", async (ctx, next) => {
    if (peekCallbackAction(ctx.callbackQuery.data) !== "slot.pick") {
      await next();
      return;
    }
    await handleSlotPick(ctx, ctx.callbackQuery.data);
  });

  composer.on("callback_query:data", async (ctx, next) => {
    if (peekCallbackAction(ctx.callbackQuery.data) !== "slot.other") {
      await next();
      return;
    }
    await handleSlotOther(ctx, ctx.callbackQuery.data);
  });
}

/** The booked/already-booked branches only carry a `BlockBooking`; the card needs the task it belongs to. */
async function requireTask(ctx: BotContext, userId: string, taskId: string) {
  const task = await ctx.services.tasks.get(userId, taskId);
  if (task === null) throw new NotFoundError(`Task ${taskId} does not exist`);
  return task;
}

async function nextSlotsCard(ctx: BotContext, userId: string, taskId: string, viewCtx: ViewContext) {
  const result = await ctx.services.personalFlow.nextSlots({ userId, taskId });
  if (result.kind === "no_more_slots") {
    const task = await requireTask(ctx, userId, taskId);
    return taskProposalView({ state: "no_slots", task, search: result.search }, viewCtx);
  }
  return proposalCard(result, viewCtx);
}

async function handleSlotPick(ctx: BotContext, data: string): Promise<void> {
  // Answer immediately for idempotency: double-press shows no spinner
  await answerCallback(ctx);

  const owner = ownerOf(ctx);
  const resolved = await ctx.services.callbacks.resolve(data, owner);
  if (resolved.action !== "slot.pick") throw new Error("slot.pick handler resolved a different action");
  const target = targetOfCallback(ctx);
  const viewCtx: ViewContext = ctx.viewContext(await ctx.loadSettings());

  let result;
  try {
    result = await ctx.services.personalFlow.confirmSlot({
      userId: owner.userId,
      taskId: resolved.payload.taskId,
      slotIndex: resolved.payload.slotIndex,
    });
  } catch (error) {
    // The callback token is single-use. Restore an actionable card before
    // rethrowing so the error boundary can log and report the failed booking.
    const retryCard = await nextSlotsCard(ctx, owner.userId, resolved.payload.taskId, viewCtx);
    await editCard(ctx, target, retryCard);
    throw error;
  }

  switch (result.kind) {
    case "booked": {
      const rendered = taskProposalView({ state: "booked", task: result.task, slot: result.booking.slot }, viewCtx);
      await editCard(ctx, target, rendered);
      return;
    }
    case "already_booked":
    case "already_booked_other_slot": {
      // Idempotent double-press: show the booking that actually won, not an error.
      const task = await requireTask(ctx, owner.userId, result.booking.taskId);
      const rendered = taskProposalView({ state: "booked", task, slot: result.booking.slot }, viewCtx);
      await editCard(ctx, target, rendered);
      return;
    }
    case "slot_taken": {
      const notice = noticeForKind("slot_conflict", viewCtx);
      await editCard(ctx, target, notice.message);
      await answerCallback(ctx, notice.text, { alert: true });
      return;
    }
    case "no_such_slot": {
      const notice = noticeForKind("unavailable", viewCtx);
      await editCard(ctx, target, notice.message);
      await answerCallback(ctx, notice.text, { alert: true });
      return;
    }
  }
}

async function handleSlotOther(ctx: BotContext, data: string): Promise<void> {
  // Answer immediately for idempotency
  await answerCallback(ctx);

  const owner = ownerOf(ctx);
  const resolved = await ctx.services.callbacks.resolve(data, owner);
  if (resolved.action !== "slot.other") throw new Error("slot.other handler resolved a different action");
  const target = targetOfCallback(ctx);
  const viewCtx: ViewContext = ctx.viewContext(await ctx.loadSettings());

  await editCard(ctx, target, await nextSlotsCard(ctx, owner.userId, resolved.payload.taskId, viewCtx));
}
