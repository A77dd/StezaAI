import { InvalidIntentError } from "../index";
import type { DraftId, IntentKind, SlotProposal, Task, UserId } from "../index";
import type { PersonalFlowPorts } from "./ports";
import { createTaskAndPropose } from "./shared";
import type { SlotSearchSummary } from "./shared";

export type ChooseIntentInput = {
  readonly userId: UserId;
  readonly draftId: DraftId;
  readonly kind: IntentKind;
};

export type ChooseIntentResult =
  | { readonly kind: "draft_not_found" }
  /**
   * The user resolved a low-confidence or `info` draft as `info`. AGENTS.md:
   * a meaningful inferred memory item needs user confirmation before durable
   * storage, and choosing "just a note" here is not that confirmation (there
   * is no separate "yes, remember this" step yet) — so nothing is persisted.
   */
  | { readonly kind: "noted" }
  | { readonly kind: "proposed"; readonly task: Task; readonly proposal: SlotProposal; readonly search: SlotSearchSummary }
  | { readonly kind: "no_slots"; readonly task: Task; readonly search: SlotSearchSummary };

/**
 * Resolves a clarification or classification draft (`submitText`'s
 * `needs_clarification` / `info_only`) once the user picks a kind: builds the
 * task from the draft's parsed fields with the chosen `kind` and proceeds
 * exactly like `submitText` from that point on.
 */
export function createChooseIntent(
  ports: Pick<
    PersonalFlowPorts,
    "drafts" | "tasks" | "proposals" | "settings" | "calendar" | "scheduler" | "clock" | "ids"
  >,
) {
  return async function chooseIntent(input: ChooseIntentInput): Promise<ChooseIntentResult> {
    const draft = await ports.drafts.get(input.userId, input.draftId);
    if (draft === null) {
      return { kind: "draft_not_found" };
    }
    if (draft.intent === null) {
      throw new InvalidIntentError("Draft has no parsed intent to choose a kind for");
    }

    const intent = { ...draft.intent, kind: input.kind };

    if (intent.kind === "info") {
      await ports.drafts.delete(input.userId, input.draftId);
      return { kind: "noted" };
    }

    const outcome = await createTaskAndPropose(ports, {
      userId: input.userId,
      intent,
      source: draft.source,
    });
    await ports.drafts.delete(input.userId, input.draftId);
    return outcome;
  };
}
