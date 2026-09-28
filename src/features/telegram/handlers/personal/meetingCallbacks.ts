import type { Composer } from "grammy";
import { addMinutes, PENDING_INPUT_TTL_MINUTES } from "../../domain";
import type { BotContext } from "../../bot";
import { answerCallback, editCard, ownerOf, sendCard, targetOfCallback } from "../../bot";
import { meetingBookedView, meetingCancelledView, noticeForKind, renderMessage, text } from "../../render";
import { peekCallbackAction } from "./callbackRouting";

export function registerMeetingCallbacks(composer: Composer<BotContext>): void {
  composer.on("callback_query:data", async (ctx, next) => {
    const action = peekCallbackAction(ctx.callbackQuery.data);
    if (action !== "meeting.cancel" && action !== "meeting.reminder" && action !== "meeting.details" && action !== "meeting.time") {
      await next();
      return;
    }
    const owner = ownerOf(ctx);
    const resolved = await ctx.services.callbacks.resolve(ctx.callbackQuery.data, owner);
    const target = targetOfCallback(ctx);
    const viewCtx = ctx.viewContext(await ctx.loadSettings());

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
      await editCard(ctx, target, meetingCancelledView(task, booking.slot, viewCtx));
      return;
    }

    if (resolved.action === "meeting.time") {
      if (target.kind !== "chat") throw new Error("Meeting time changes require a private chat card");
      const previous = ctx.services.promptTracker.peek(owner.userId, target.chatId);
      if (previous?.purpose === "meeting_details" || previous?.purpose === "meeting_time") {
        await ctx.services.pendingInputs.consumeByPrompt(owner.userId, target.chatId, previous.promptMessageId);
        ctx.services.promptTracker.consume(owner.userId, target.chatId);
      }
      const prompt = await sendCard(ctx, renderMessage({ body: text(viewCtx.catalog.task.meetingTimePrompt) }));
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
    await editCard(ctx, target, meetingBookedView({ task: updated, slot: booking.slot }, viewCtx));
  });
}
