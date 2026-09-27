import type { SlotProposal, SlotSearchResult, Task } from "../../domain";
import type { BotContext } from "../../bot";
import { describeError, sendCard } from "../../bot";
import {
  noticeForKind,
  personalClarifyView,
  personalInfoOnlyView,
  richCalendarMonthView,
  taskProposalView,
} from "../../render";
import { initialCalendarMonth } from "../../render";
import type { RenderedMessage, ViewContext } from "../../render";
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
  }
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
