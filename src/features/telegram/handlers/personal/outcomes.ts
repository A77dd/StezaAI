import type { SlotProposal, SlotSearchResult, Task } from "../../domain";
import type { BotContext } from "../../bot";
import { sendCard } from "../../bot";
import { noticeForKind, personalClarifyView, personalInfoOnlyView, taskProposalView } from "../../render";
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
      await sendCard(ctx, proposalCard(outcome, viewCtx));
  }
}
