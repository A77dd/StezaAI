import type { Composer } from "grammy";
import { NotFoundError } from "../../domain";
import type { BotContext } from "../../bot";
import { answerCallback, editCard, ownerOf, targetOfCallback } from "../../bot";
import {
  initialCalendarMonth,
  noticeForKind,
  richBookedView,
  richCalendarDayView,
  richCalendarMonthView,
  taskProposalView,
} from "../../render";
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
    const action = peekCallbackAction(ctx.callbackQuery.data);
    if (action !== "slot.other" && action !== "calendar.month" && action !== "calendar.day") {
      await next();
      return;
    }
    if (action !== "slot.other") {
      await handleCalendarView(ctx, ctx.callbackQuery.data, action);
      return;
    }
    await handleSlotOther(ctx, ctx.callbackQuery.data);
  });
}

/**
 * True when the pressed button lives inside a Rich Message: the card must be
 * re-rendered as rich too (research §5.2 pattern: press → re-render the same
 * message), otherwise the HTML keyboard card is kept.
 */
function isRichSource(ctx: BotContext): boolean {
  return ctx.callbackQuery?.message?.rich_message !== undefined;
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
      slotStart: resolved.payload.slotStart,
      slotEnd: resolved.payload.slotEnd,
    });
  } catch (error) {
    // The callback token is single-use. Restore an actionable card before
    // rethrowing so the error boundary can log and report the failed booking.
    const retryable = await ctx.services.personalFlow.getRetryableProposal({
      userId: owner.userId,
      taskId: resolved.payload.taskId,
    });
    if (retryable !== null) {
      const rendered = isRichSource(ctx)
        ? richCalendarMonthView(
            { task: retryable.task, slots: retryable.proposal.slots },
            initialCalendarMonth(retryable.proposal.slots, viewCtx.timezone),
            viewCtx,
          )
        : proposalCard({ kind: "proposed", ...retryable }, viewCtx);
      await editCard(ctx, target, rendered);
    }
    throw error;
  }

  switch (result.kind) {
    case "booked": {
      const rendered = isRichSource(ctx)
        ? richBookedView({ task: result.task, slot: result.booking.slot }, viewCtx)
        : taskProposalView({ state: "booked", task: result.task, slot: result.booking.slot }, viewCtx);
      await editCard(ctx, target, rendered);
      await answerCallback(ctx);
      return;
    }
    case "already_booked":
    case "already_booked_other_slot": {
      // Idempotent double-press: show the booking that actually won, not an error.
      const task = await requireTask(ctx, owner.userId, result.booking.taskId);
      const rendered = isRichSource(ctx)
        ? richBookedView({ task, slot: result.booking.slot }, viewCtx)
        : taskProposalView({ state: "booked", task, slot: result.booking.slot }, viewCtx);
      await editCard(ctx, target, rendered);
      await answerCallback(ctx);
      return;
    }
    case "slot_taken": {
      const task = await requireTask(ctx, owner.userId, result.proposal.taskId);
      const outcome = result.proposal.slots.length === 0
        ? { kind: "no_slots" as const, task, search: result.search }
        : { kind: "proposed" as const, task, proposal: result.proposal };
      const rendered = isRichSource(ctx) && outcome.kind === "proposed"
        ? richCalendarMonthView(
            { task, slots: outcome.proposal.slots },
            initialCalendarMonth(outcome.proposal.slots, viewCtx.timezone),
            viewCtx,
          )
        : proposalCard(outcome, viewCtx);
      await editCard(ctx, target, rendered);
      await answerCallback(ctx);
      return;
    }
    case "no_such_slot": {
      const notice = noticeForKind("unavailable", viewCtx);
      // The callback may target an older proposal message. Keep the current card intact.
      await answerCallback(ctx, notice.text, { alert: true });
      return;
    }
  }
}

/**
 * `calendar.month` / `calendar.day`: navigation inside the Rich calendar
 * card. Each press re-renders the same message (fresh tokens included) and is
 * idempotent, so the tokens are not single-use. A proposal that has expired
 * or was booked meanwhile answers with the regular expired notice.
 */
async function handleCalendarView(
  ctx: BotContext,
  data: string,
  action: "calendar.month" | "calendar.day",
): Promise<void> {
  await answerCallback(ctx);

  const owner = ownerOf(ctx);
  const resolved = await ctx.services.callbacks.resolve(data, owner);
  if (resolved.action !== action) throw new Error("calendar handler resolved a different action");
  const target = targetOfCallback(ctx);
  const viewCtx: ViewContext = ctx.viewContext(await ctx.loadSettings());

  const task = await requireTask(ctx, owner.userId, resolved.payload.taskId);
  const proposal = await ctx.services.proposals.get(owner.userId, resolved.payload.taskId);
  if (proposal === null || proposal.slots.length === 0) {
    await editCard(ctx, target, noticeForKind("expired", viewCtx).message);
    return;
  }
  const input = { task, slots: proposal.slots };
  const rendered =
    resolved.action === "calendar.month"
      ? richCalendarMonthView(input, { ...resolved.payload }, viewCtx)
      : richCalendarDayView(input, { ...resolved.payload }, viewCtx);
  await editCard(ctx, target, rendered);
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
