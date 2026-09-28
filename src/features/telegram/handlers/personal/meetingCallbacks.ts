import type { Composer } from "grammy";
import type { Slot, Task } from "../../domain";
import { addMinutes, fromZoned, toZonedParts, PENDING_INPUT_TTL_MINUTES } from "../../domain";
import type { BotContext } from "../../bot";
import { answerCallback, describeError, editCard, ownerOf, sendCard, targetOfCallback } from "../../bot";
import {
  initialCalendarMonth,
  meetingBookedRichView,
  meetingCancelledRichView,
  meetingMoveConfirmRichView,
  meetingNegotiationRichView,
  meetingRescheduleView,
  noticeForKind,
  renderMessage,
  richCalendarMonthView,
  text,
} from "../../render";
import { fillPlain } from "../../render/catalog";
import { createBookMeeting } from "../../domain/useCases";
import { NotFoundError } from "../../domain";
import type { ViewContext } from "../../render";
import { peekCallbackAction } from "./callbackRouting";
import { sendProposalCard } from "./outcomes";

export function registerMeetingCallbacks(composer: Composer<BotContext>): void {
  composer.on("callback_query:data", async (ctx, next) => {
    const action = peekCallbackAction(ctx.callbackQuery.data);
    if (
      action !== "meeting.cancel" && action !== "meeting.reminder" && action !== "meeting.details" && action !== "meeting.time" &&
      action !== "meeting.reschedule.month" && action !== "meeting.reschedule.day" && action !== "meeting.reschedule.hour" &&
      action !== "meeting.conflict.accept" && action !== "meeting.conflict.slots" && action !== "meeting.conflict.keep" &&
      action !== "meeting.conflict.move" && action !== "meeting.conflict.move.confirm"
    ) {
      await next();
      return;
    }
    const owner = ownerOf(ctx);
    const resolved = await ctx.services.callbacks.resolve(ctx.callbackQuery.data, owner);
    const target = targetOfCallback(ctx);
    const viewCtx = ctx.viewContext(await ctx.loadSettings());

    if (
      resolved.action === "meeting.conflict.accept" || resolved.action === "meeting.conflict.slots" ||
      resolved.action === "meeting.conflict.keep" || resolved.action === "meeting.conflict.move" ||
      resolved.action === "meeting.conflict.move.confirm"
    ) {
      return void (await handleConflict(ctx, owner.userId, resolved.action, resolved.payload, target, viewCtx));
    }

    if (
      resolved.action === "meeting.reschedule.month" || resolved.action === "meeting.reschedule.day" ||
      resolved.action === "meeting.reschedule.hour"
    ) {
      // The answer happens inside: a race conflict needs the alert, not a plain ack.
      return void (await handleReschedule(ctx, owner.userId, resolved.action, resolved.payload, target, viewCtx));
    }

    if (resolved.action === "meeting.details") {
      // The next text message in this chat becomes the meeting details. The
      // button re-arms the capture on its own card (the quiet follow-up's
      // pending input may already be consumed); the toast is the first answer.
      if (target.kind !== "chat") throw new Error("Meeting details capture requires a private chat card");
      await answerCallback(ctx, viewCtx.catalog.task.meetingDetailsPrompt);
      await ctx.services.pendingInputs.save({
        userId: owner.userId, chatId: target.chatId, promptMessageId: target.messageId,
        purpose: "meeting_details", refId: resolved.payload.taskId,
        expiresAt: addMinutes(ctx.services.clock.now(), PENDING_INPUT_TTL_MINUTES),
      });
      ctx.services.promptTracker.remember(owner.userId, target.chatId, {
        promptMessageId: target.messageId, purpose: "meeting_details", cardMessageId: target.messageId,
      });
      return;
    }

    await answerCallback(ctx);

    if (resolved.action === "meeting.cancel") {
      const task = await ctx.services.tasks.get(owner.userId, resolved.payload.taskId);
      if (task === null || task.bookingId === null) {
        await editCard(ctx, target, noticeForKind("expired", viewCtx).message);
        return;
      }
      const booking = await ctx.services.calendar.getBlock(owner.userId, task.bookingId);
      if (booking === null) {
        await editCard(ctx, target, noticeForKind("expired", viewCtx).message);
        return;
      }
      await ctx.services.personalFlow.cancelTask({ userId: owner.userId, taskId: task.id });
      if (target.kind === "chat") {
        const remembered = ctx.services.promptTracker.peek(owner.userId, target.chatId);
        if (remembered?.purpose === "meeting_details" || remembered?.purpose === "meeting_time") {
          const pending = await ctx.services.pendingInputs.peekByPrompt(owner.userId, target.chatId, remembered.promptMessageId);
          if (pending?.refId === task.id) {
            await ctx.services.pendingInputs.consumeByPrompt(owner.userId, target.chatId, remembered.promptMessageId);
            ctx.services.promptTracker.consume(owner.userId, target.chatId);
          }
        }
      }
      await editCard(ctx, target, meetingCancelledRichView(task, booking.slot, viewCtx));
      return;
    }

    if (resolved.action === "meeting.time") {
      if (target.kind !== "chat") throw new Error("Meeting time changes require a private chat card");
      const previous = ctx.services.promptTracker.peek(owner.userId, target.chatId);
      if (previous?.purpose === "meeting_details" || previous?.purpose === "meeting_time") {
        await ctx.services.pendingInputs.consumeByPrompt(owner.userId, target.chatId, previous.promptMessageId);
        ctx.services.promptTracker.consume(owner.userId, target.chatId);
      }
      // The interactive reschedule calendar: the user's own busy days and
      // hours are disabled; free text stays armed on this message as well.
      const task = await ctx.services.tasks.get(owner.userId, resolved.payload.taskId);
      if (task === null || task.bookingId === null) {
        await editCard(ctx, target, noticeForKind("expired", viewCtx).message);
        return;
      }
      const booking = await ctx.services.calendar.getBlock(owner.userId, task.bookingId);
      if (booking === null) {
        await editCard(ctx, target, noticeForKind("expired", viewCtx).message);
        return;
      }
      const monthStart = startOfMonthUtc(booking.slot.start, viewCtx);
      const busy = await ctx.services.calendar.getBusyIntervals(owner.userId, {
        start: monthStart,
        end: addMinutes(monthStart, 4 * 31 * 24 * 60),
      });
      let prompt;
      try {
        prompt = await sendCard(
          ctx,
          meetingRescheduleView(
            { task, slot: booking.slot, busy, cardMessageId: target.messageId, now: ctx.services.clock.now() },
            monthViewOf(booking.slot.start, viewCtx),
            viewCtx,
          ),
        );
      } catch (error) {
        // Old client or API path: the free-text prompt card is the fallback
        // (the text capture below works identically for both).
        ctx.log.warn("meeting.reschedule_rich_fallback", describeError(error));
        prompt = await sendCard(ctx, renderMessage({ body: text(viewCtx.catalog.task.meetingTimePrompt) }));
      }
      await ctx.services.pendingInputs.save({
        userId: owner.userId, chatId: target.chatId, promptMessageId: prompt.message_id,
        purpose: "meeting_time", refId: resolved.payload.taskId,
        expiresAt: addMinutes(ctx.services.clock.now(), PENDING_INPUT_TTL_MINUTES),
      });
      ctx.services.promptTracker.remember(owner.userId, target.chatId, {
        promptMessageId: prompt.message_id, purpose: "meeting_time", cardMessageId: target.messageId,
      });
      return;
    }

    if (resolved.action !== "meeting.reminder") throw new Error("meeting callback resolved a different action");
    const task = await ctx.services.tasks.get(owner.userId, resolved.payload.taskId);
    if (task === null || task.bookingId === null) {
      await editCard(ctx, target, noticeForKind("expired", viewCtx).message);
      return;
    }
    const booking = await ctx.services.calendar.getBlock(owner.userId, task.bookingId);
    if (booking === null) {
      await editCard(ctx, target, noticeForKind("expired", viewCtx).message);
      return;
    }
    if ((task.meetingReminderEnabled !== false) !== resolved.payload.enabled) {
      await ctx.services.tasks.update(owner.userId, task.id, { meetingReminderEnabled: resolved.payload.enabled });
      if (resolved.payload.enabled) {
        await ctx.services.reminders.cancelForTask(owner.userId, task.id);
        const dueAt = addMinutes(booking.slot.start, -60);
        if (Date.parse(dueAt) > Date.parse(ctx.services.clock.now()) && task.source.sourceChatId !== null) {
          await ctx.services.reminders.schedule({ id: ctx.services.ids.next("reminder"), userId: owner.userId, chatId: task.source.sourceChatId, taskId: task.id, kind: "block_start", dueAt });
        }
      } else {
        await ctx.services.reminders.cancelForTask(owner.userId, task.id);
      }
    }
    const updated = await ctx.services.tasks.get(owner.userId, task.id);
    if (updated === null) throw new Error(`Meeting ${task.id} disappeared after reminder update`);
    await editCard(ctx, target, meetingBookedRichView({ task: updated, slot: booking.slot }, viewCtx));
  });
}

/** The month of the given instant, in the user's timezone. */
function monthViewOf(instant: string, ctx: ViewContext): { readonly year: number; readonly month: number } {
  const parts = toZonedParts(instant, ctx.timezone);
  return { year: parts.year, month: parts.month };
}

function startOfMonthUtc(instant: string, ctx: ViewContext): string {
  const parts = toZonedParts(instant, ctx.timezone);
  return fromZoned({ year: parts.year, month: parts.month, day: 1, hour: 0, minute: 0 }, ctx.timezone);
}

type ReschedulePayload = {
  readonly taskId: string;
  readonly cardMessageId: number;
  readonly year: number;
  readonly month: number;
  readonly day?: number;
  readonly hour?: number;
};

/** Renders the reschedule calendar state and, for a picked hour, moves the meeting. */
async function handleReschedule(
  ctx: BotContext,
  userId: string,
  action: "meeting.reschedule.month" | "meeting.reschedule.day" | "meeting.reschedule.hour",
  payload: ReschedulePayload,
  target: ReturnType<typeof targetOfCallback>,
  viewCtx: ViewContext,
): Promise<void> {
  const task = await ctx.services.tasks.get(userId, payload.taskId);
  if (task === null || task.bookingId === null) {
    await editCard(ctx, target, noticeForKind("expired", viewCtx).message);
    return;
  }
  const booking = await ctx.services.calendar.getBlock(userId, task.bookingId);
  if (booking === null) {
    await editCard(ctx, target, noticeForKind("expired", viewCtx).message);
    return;
  }

  const monthStart = fromZoned({ year: payload.year, month: payload.month, day: 1, hour: 0, minute: 0 }, viewCtx.timezone);
  const busy = await ctx.services.calendar.getBusyIntervals(userId, {
    start: monthStart,
    end: addMinutes(monthStart, 4 * 31 * 24 * 60),
  });
  const input = { task, slot: booking.slot, busy, cardMessageId: payload.cardMessageId, now: ctx.services.clock.now() };

  if (action !== "meeting.reschedule.hour") {
    const view = { year: payload.year, month: payload.month, ...(payload.day === undefined ? {} : { day: payload.day }) };
    await editCard(ctx, target, meetingRescheduleView(input, view, viewCtx));
    return;
  }

  if (payload.day === undefined || payload.hour === undefined) throw new Error("meeting.reschedule.hour requires day and hour");
  const start = fromZoned({ year: payload.year, month: payload.month, day: payload.day, hour: payload.hour, minute: 0 }, viewCtx.timezone);
  const result = await ctx.services.personalFlow.rescheduleMeeting({ userId, taskId: payload.taskId, start });

  if (result.kind === "time_conflict") {
    // A race between rendering and pressing: the hour filled up meanwhile.
    // Re-render the same day with fresh busy data and tell the user.
    await answerCallback(ctx, viewCtx.catalog.task.meetingTimeConflict, { alert: true });
    await editCard(ctx, target, meetingRescheduleView(input, { year: payload.year, month: payload.month, day: payload.day }, viewCtx));
    return;
  }
  if (result.kind === "time_missing") {
    await answerCallback(ctx, viewCtx.catalog.task.meetingTimeMissing, { alert: true });
    return;
  }
  // Moved: both the calendar message and the original meeting card show the new time.
  const booked = meetingBookedRichView({ task: result.task, slot: result.booking.slot }, viewCtx);
  await editCard(ctx, target, booked);
  if (target.kind === "chat" && target.messageId !== payload.cardMessageId) {
    await editCard(ctx, { kind: "chat", chatId: target.chatId, messageId: payload.cardMessageId }, booked);
  }
}

type ConflictPayload = {
  readonly taskId: string;
  readonly existingTaskId?: string;
  readonly slotIndex?: number;
  readonly slotStart?: string;
  readonly slotEnd?: string;
  readonly requestedStart?: string;
  readonly requestedEnd?: string;
  readonly proposedStart?: string;
};

/** The conflict-card actions: book the proposed slot, browse others, keep both, or move the existing meeting. */
async function handleConflict(
  ctx: BotContext,
  userId: string,
  action: "meeting.conflict.accept" | "meeting.conflict.slots" | "meeting.conflict.keep" | "meeting.conflict.move" | "meeting.conflict.move.confirm",
  payload: ConflictPayload,
  target: ReturnType<typeof targetOfCallback>,
  viewCtx: ViewContext,
): Promise<void> {
  const copy = viewCtx.catalog.task;
  const task = await ctx.services.tasks.get(userId, payload.taskId);
  if (task === null) {
    await editCard(ctx, target, noticeForKind("expired", viewCtx).message);
    return;
  }
  const username = task.source.sourceAuthorUsername ?? null;

  if (action === "meeting.conflict.accept") {
    // Book the proposed slot (same race-safe path as the proposal flow) and
    // hand the user the phrase to send to the counterpart.
    if (payload.slotIndex === undefined || payload.slotStart === undefined || payload.slotEnd === undefined ||
        payload.requestedStart === undefined || payload.requestedEnd === undefined) {
      throw new Error("meeting.conflict.accept requires the slot and requested times");
    }
    const result = await ctx.services.personalFlow.confirmSlot({
      userId, taskId: payload.taskId, slotIndex: payload.slotIndex, slotStart: payload.slotStart, slotEnd: payload.slotEnd,
    });
    if (result.kind === "booked" || result.kind === "already_booked" || result.kind === "already_booked_other_slot") {
      const booking = result.booking;
      await answerCallback(ctx);
      await editCard(
        ctx,
        target,
        meetingNegotiationRichView(
          {
            headline: fillPlain(copy.meetingNegotiateBooked, { slot: shortRange(booking.slot, viewCtx.timezone) }),
            requested: { start: payload.requestedStart, end: payload.requestedEnd },
            suggested: booking.slot,
            username,
          },
          viewCtx,
        ),
      );
      return;
    }
    // The slot was taken or vanished meanwhile: the fresh proposal is the honest answer.
    await answerCallback(ctx);
    if (result.kind === "slot_taken") {
      const bookedTask = await ctx.services.tasks.get(userId, result.proposal.taskId);
      if (bookedTask === null) throw new NotFoundError(`Task ${result.proposal.taskId} does not exist`);
      const outcome = result.proposal.slots.length === 0
        ? { kind: "no_slots" as const, task: bookedTask, search: result.search }
        : { kind: "proposed" as const, task: bookedTask, proposal: result.proposal };
      await sendProposalCard(ctx, outcome, viewCtx);
      return;
    }
    await answerCallback(ctx, copy.meetingNoDetails, { alert: true });
    return;
  }

  if (action === "meeting.conflict.keep") {
    if (payload.requestedStart === undefined || payload.requestedEnd === undefined) {
      throw new Error("meeting.conflict.keep requires the requested times");
    }
    await answerCallback(ctx);
    await editCard(
      ctx,
      target,
      meetingNegotiationRichView(
        {
          headline: copy.meetingConflictKeepNote,
          requested: { start: payload.requestedStart, end: payload.requestedEnd },
          suggested: null,
          username,
        },
        viewCtx,
      ),
    );
    return;
  }

  if (action === "meeting.conflict.slots") {
    await answerCallback(ctx);
    const proposal = await ctx.services.proposals.get(userId, payload.taskId);
    if (proposal === null || proposal.slots.length === 0) {
      await editCard(ctx, target, noticeForKind("expired", viewCtx).message);
      return;
    }
    await editCard(
      ctx,
      target,
      meetingConflictSlotsView(task, proposal.slots, viewCtx),
    );
    return;
  }

  // Move the existing meeting: first the separate confirmation with the new time.
  if (action === "meeting.conflict.move") {
    if (payload.existingTaskId === undefined || payload.proposedStart === undefined) {
      throw new Error("meeting.conflict.move requires the existing task and the proposed start");
    }
    await answerCallback(ctx);
    const existing = await ctx.services.tasks.get(userId, payload.existingTaskId);
    if (existing === null || existing.bookingId === null) {
      await editCard(ctx, target, noticeForKind("expired", viewCtx).message);
      return;
    }
    const booking = await ctx.services.calendar.getBlock(userId, existing.bookingId);
    if (booking === null) {
      await editCard(ctx, target, noticeForKind("expired", viewCtx).message);
      return;
    }
    const duration = existing.durationMinutes ?? (await requireSettingsOrThrow(ctx, userId)).defaultBlockMinutes;
    const proposed = { start: payload.proposedStart, end: addMinutes(payload.proposedStart, duration) };
    await editCard(
      ctx,
      target,
      meetingMoveConfirmRichView(
        { existingTitle: existing.title, existingTaskId: existing.id, existingSlot: booking.slot, proposed, taskId: payload.taskId },
        viewCtx,
      ),
    );
    return;
  }

  // The confirmed move: the existing meeting goes to the proposed time, the
  // new one takes the freed requested slot.
  await answerCallback(ctx);
  if (payload.existingTaskId === undefined || payload.proposedStart === undefined) {
    throw new Error("meeting.conflict.move.confirm requires the existing task and the proposed start");
  }
  const existing = await ctx.services.tasks.get(userId, payload.existingTaskId);
  if (existing === null || existing.bookingId === null) {
    await editCard(ctx, target, noticeForKind("expired", viewCtx).message);
    return;
  }
  const currentBooking = await ctx.services.calendar.getBlock(userId, existing.bookingId);
  if (currentBooking === null) {
    await editCard(ctx, target, noticeForKind("expired", viewCtx).message);
    return;
  }
  const freedSlot = currentBooking.slot;
  const move = await ctx.services.personalFlow.rescheduleMeeting({ userId, taskId: existing.id, start: payload.proposedStart });
  if (move.kind === "time_conflict") {
    await answerCallback(ctx, copy.meetingTimeConflict, { alert: true });
    return;
  }
  if (move.kind === "time_missing") {
    await answerCallback(ctx, copy.meetingTimeMissing, { alert: true });
    return;
  }
  const booking = await createBookMeeting(ctx.services)({
    userId,
    intent: {
      kind: "meeting", title: task.title, deadline: null, durationMinutes: task.durationMinutes,
      scheduledStartAt: freedSlot.start, priority: task.priority, participants: [], confidence: 1,
    },
    source: task.source,
  });
  if (booking.kind !== "meeting_booked") {
    // The requested time is still busy by something else: keep the move and
    // offer the fresh proposal path.
    await sendProposalCard(ctx, { kind: "proposed", task: booking.task, proposal: booking.proposal }, viewCtx);
    return;
  }
  await editCard(ctx, target, meetingBookedRichView({ task: booking.task, slot: booking.booking.slot }, viewCtx));
  await sendCard(
    ctx,
    meetingNegotiationRichView(
      {
        headline: fillPlain(copy.meetingMovedBoth, {
          slot: shortRange(booking.booking.slot, viewCtx.timezone),
          existing: existing.title,
          movedSlot: shortRange(move.booking.slot, viewCtx.timezone),
        }),
        requested: freedSlot,
        suggested: null,
        username,
      },
      viewCtx,
    ),
  );
}

function shortRange(slot: Slot, timezone: string): string {
  const start = toZonedParts(slot.start, timezone);
  const end = toZonedParts(slot.end, timezone);
  return `${start.hour}:${String(start.minute).padStart(2, "0")}–${end.hour}:${String(end.minute).padStart(2, "0")}`;
}

async function requireSettingsOrThrow(ctx: BotContext, userId: string) {
  const settings = await ctx.services.settings.get(userId);
  if (settings === null) throw new NotFoundError(`User ${userId} has no settings`);
  return settings;
}

/** The "other slots" state: the proposal's own interactive month grid. */
function meetingConflictSlotsView(task: Task, slots: readonly Slot[], viewCtx: ViewContext) {
  return richCalendarMonthView({ task, slots }, initialCalendarMonth(slots, viewCtx.timezone), viewCtx);
}
