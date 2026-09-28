import { addMinutes, PENDING_INPUT_TTL_MINUTES } from "../../domain";
import type { Slot, SlotProposal, SlotSearchResult, Task } from "../../domain";
import type { BotContext } from "../../bot";
import { describeError, editCard, sendCard } from "../../bot";
import {
  noticeForKind,
  personalClarifyView,
  personalInfoOnlyView,
  richCalendarMonthView,
  taskProposalView,
  meetingBookedRichView,
  meetingBookedView,
  renderMessage,
  text,
} from "../../render";
import { initialCalendarMonth } from "../../render";
import type { RenderedMessage, ViewContext } from "../../render";
import type { MessageTarget } from "../../bot";
import type { SubmitTextResult } from "../../domain/useCases";

/**
 * The shape shared by every personal-flow result that ends in a proposed task
 * card or an exhausted search: `submitText`, `chooseIntent`, `applyTaskEdit`
 * and `nextSlots` all produce one of these two variants (with extra kinds of
 * their own besides), so the card is rendered in one place.
 */
export type ProposalOutcome =
  | { readonly kind: "proposed"; readonly task: Task; readonly proposal: SlotProposal }
  | { readonly kind: "no_slots"; readonly task: Task; readonly search: Pick<SlotSearchResult, "exhausted" | "searchedUntil"> };

export function proposalCard(outcome: ProposalOutcome, ctx: ViewContext): RenderedMessage {
  return outcome.kind === "proposed"
    ? taskProposalView({ state: "proposed", task: outcome.task, slots: outcome.proposal.slots }, ctx)
    : taskProposalView({ state: "no_slots", task: outcome.task, search: outcome.search }, ctx);
}

/**
 * Sends a fresh message for every outcome `submitText` (or a timezone
 * replay of one, via `setTimezone`) can produce once the timezone gate is
 * passed: `unparseable`, `needs_clarification`, `info_only`, `proposed` and
 * `no_slots`. `timezone_required` is excluded (both call sites handle that
 * gate themselves) so this is total over what is left.
 */
export async function sendSubmitOutcome(
  ctx: BotContext,
  userId: string,
  outcome: Exclude<SubmitTextResult, { kind: "timezone_required" }>,
  viewCtx: ViewContext,
): Promise<void> {
  switch (outcome.kind) {
    case "unparseable":
      await sendCard(ctx, noticeForKind("failure", viewCtx).message);
      return;
    case "needs_clarification":
      await sendCard(ctx, personalClarifyView({ draftId: outcome.draftId, title: outcome.intent.title }, viewCtx));
      return;
    case "info_only": {
      const draft = await ctx.services.drafts.get(userId, outcome.draftId);
      if (draft === null || draft.intent === null) {
        await sendCard(ctx, noticeForKind("expired", viewCtx).message);
        return;
      }
      await sendCard(ctx, personalInfoOnlyView({ draftId: outcome.draftId, title: draft.intent.title }, viewCtx));
      return;
    }
    case "proposed":
    case "no_slots":
      await sendProposalCard(ctx, outcome, viewCtx);
      return;
    case "meeting_booked": {
      await sendMeetingBookedOutcome(ctx, userId, outcome.task, outcome.booking.slot, viewCtx);
      return;
    }
    case "meeting_conflict": {
      await sendCard(ctx, renderMessage({ body: text(viewCtx.catalog.task.meetingConflict) }));
      if (outcome.proposal.slots.length === 0) {
        await sendCard(ctx, taskProposalView({ state: "no_slots", task: outcome.task, search: outcome.search }, viewCtx));
      } else {
        await sendProposalCard(ctx, { kind: "proposed", task: outcome.task, proposal: outcome.proposal }, viewCtx);
      }
      return;
    }
  }
}

export async function sendMeetingBookedOutcome(
  ctx: BotContext,
  userId: string,
  task: Task,
  slot: Slot,
  viewCtx: ViewContext,
  target?: MessageTarget,
): Promise<void> {
  const chatId = target?.kind === "chat" ? target.chatId : ctx.chat?.id;
  if (chatId === undefined) throw new Error("Meeting details need a Telegram chat");
  let promptMessageId: number;
  if (target !== undefined) {
    if (target.kind !== "chat") throw new Error("Meeting details need a private chat card");
    await editCard(ctx, target, meetingBookedRichView({ task, slot }, viewCtx));
    promptMessageId = target.messageId;
  } else {
    // Rich card first (the approved interactive design); the HTML card is the
    // fallback when the rich send fails — nothing has been sent by then.
    try {
      promptMessageId = (await sendCard(ctx, meetingBookedRichView({ task, slot }, viewCtx))).message_id;
    } catch (error) {
      ctx.log.warn("meeting.rich_fallback", describeError(error));
      promptMessageId = (await sendCard(ctx, meetingBookedView({ task, slot }, viewCtx))).message_id;
    }
  }
  const expiresAt = addMinutes(ctx.services.clock.now(), PENDING_INPUT_TTL_MINUTES);
  await ctx.services.pendingInputs.save({
    userId, chatId, promptMessageId, purpose: "meeting_details", refId: task.id, expiresAt,
  });
  ctx.services.promptTracker.remember(userId, chatId, { promptMessageId, purpose: "meeting_details", cardMessageId: promptMessageId });
  const timer = setTimeout(() => {
    void (async () => {
      const pending = await ctx.services.pendingInputs.peekByPrompt(userId, chatId, promptMessageId);
      if (pending === null) return;
      const currentPrompt = ctx.services.promptTracker.peek(userId, chatId);
      if (currentPrompt?.purpose !== "meeting_details" || currentPrompt.promptMessageId !== promptMessageId) {
        await ctx.services.pendingInputs.consumeByPrompt(userId, chatId, promptMessageId);
        return;
      }
      const nudge = await sendCard(ctx, meetingBookedRichView({ task, slot, quietFollowUp: true }, viewCtx), { chatId, silent: true });
      await ctx.services.pendingInputs.consumeByPrompt(userId, chatId, promptMessageId);
      await ctx.services.pendingInputs.save({ userId, chatId, promptMessageId: nudge.message_id, purpose: "meeting_details", refId: task.id, expiresAt });
      ctx.services.promptTracker.remember(userId, chatId, { promptMessageId: nudge.message_id, purpose: "meeting_details", cardMessageId: promptMessageId });
    })().catch(() => ctx.services.logger.error("meeting.details_nudge_failed"));
  }, 5 * 60 * 1000);
  timer.unref?.();
}

/**
 * Sends the proposal card. The primary rendering is the Rich calendar
 * (Bot API 10.3, research §5.2 pilot): days with slots are tappable inside
 * the message. If the rich send fails (an older client or API path), the
 * HTML keyboard card is the fallback — nothing has been sent when it kicks
 * in, so there is no duplication.
 */
export async function sendProposalCard(
  ctx: BotContext,
  outcome: ProposalOutcome,
  viewCtx: ViewContext,
): Promise<void> {
  if (outcome.kind === "proposed") {
    try {
      const view = initialCalendarMonth(outcome.proposal.slots, viewCtx.timezone);
      await sendCard(
        ctx,
        richCalendarMonthView({ task: outcome.task, slots: outcome.proposal.slots }, view, viewCtx),
      );
      return;
    } catch (error) {
      ctx.log.warn("proposal.rich_fallback", describeError(error));
    }
  }
  await sendCard(ctx, proposalCard(outcome, viewCtx));
}
