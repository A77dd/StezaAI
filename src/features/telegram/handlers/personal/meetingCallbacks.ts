import type { Composer } from "grammy";
import { addMinutes, fromZoned, toZonedParts, PENDING_INPUT_TTL_MINUTES } from "../../domain";
import type { BotContext } from "../../bot";
import { answerCallback, describeError, editCard, ownerOf, sendCard, targetOfCallback } from "../../bot";
import {
  meetingBookedRichView,
  meetingCancelledRichView,
  meetingRescheduleView,
  noticeForKind,
  renderMessage,
  text,
} from "../../render";
import type { ViewContext } from "../../render";
import { peekCallbackAction } from "./callbackRouting";

export function registerMeetingCallbacks(composer: Composer<BotContext>): void {
  composer.on("callback_query:data", async (ctx, next) => {
    const action = peekCallbackAction(ctx.callbackQuery.data);
    if (
      action !== "meeting.cancel" && action !== "meeting.reminder" && action !== "meeting.details" && action !== "meeting.time" &&
      action !== "meeting.reschedule.month" && action !== "meeting.reschedule.day" && action !== "meeting.reschedule.hour"
    ) {
      await next();
      return;
    }
    const owner = ownerOf(ctx);
    const resolved = await ctx.services.callbacks.resolve(ctx.callbackQuery.data, owner);
    const target = targetOfCallback(ctx);
    const viewCtx = ctx.viewContext(await ctx.loadSettings());

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
