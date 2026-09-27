import { InvalidIntentError } from "../index";
import type { DraftId, Intent, SlotProposal, SourceRef, Task, UserId } from "../index";
import type { PersonalFlowPorts } from "./ports";
import { CLARIFY_THRESHOLD, createTaskAndPropose, requireSettings, saveDraft } from "./shared";
import type { SlotSearchSummary } from "./shared";

export type SubmitTextInput = {
  readonly userId: UserId;
  readonly chatId: number;
  readonly text: string;
  readonly source: SourceRef;
};

export type SubmitTextResult =
  | { readonly kind: "timezone_required"; readonly draftId: DraftId }
  | { readonly kind: "unparseable"; readonly reason: string }
  | { readonly kind: "needs_clarification"; readonly draftId: DraftId; readonly intent: Intent }
  | { readonly kind: "info_only"; readonly draftId: DraftId }
  | { readonly kind: "proposed"; readonly task: Task; readonly proposal: SlotProposal; readonly search: SlotSearchSummary }
  | { readonly kind: "no_slots"; readonly task: Task; readonly search: SlotSearchSummary };

/**
 * The entry point of the personal-task scenario: turns free text into either
 * a gate (timezone confirmation, a clarifying question), a note offer, or a
 * booked-slot proposal.
 *
 * Business rule: no slot is proposed until the user has confirmed a timezone.
 * Parsing is skipped entirely in that case (deadline math needs a real
 * timezone) and the raw text is kept as a draft to replay once one is set
 * (see `setTimezone`).
 */
export function createSubmitText(
  ports: Pick<
    PersonalFlowPorts,
    "settings" | "drafts" | "tasks" | "proposals" | "calendar" | "scheduler" | "intentParser" | "clock" | "ids"
  >,
) {
  return async function submitText(input: SubmitTextInput): Promise<SubmitTextResult> {
    const settings = await requireSettings(ports, input.userId);

    if (!settings.timezoneConfirmed) {
      const draft = await saveDraft(ports, {
        userId: input.userId,
        chatId: input.chatId,
        intent: null,
        source: { ...input.source, sourceText: input.text },
        kind: "timezone",
      });
      return { kind: "timezone_required", draftId: draft.id };
    }

    let intent: Intent;
    try {
      intent = await ports.intentParser.parse({
        text: input.text,
        now: ports.clock.now(),
        timezone: settings.timezone,
        source: input.source,
      });
    } catch (error) {
      if (error instanceof InvalidIntentError) {
        return { kind: "unparseable", reason: error.message };
      }
      throw error;
    }

    // `info` is a definitive classification (nothing actionable was found), not
    // a low-confidence guess, so it is offered as a note before the confidence
    // gate: an `info` intent's confidence is always below CLARIFY_THRESHOLD
    // (the rule-based parser's CONFIDENCE_NOTHING), and that must not turn
    // into "please clarify" for a message that was already understood as info.
    if (intent.kind === "info") {
      const draft = await saveDraft(ports, {
        userId: input.userId,
        chatId: input.chatId,
        intent,
        source: input.source,
        kind: "intent",
      });
      return { kind: "info_only", draftId: draft.id };
    }

    if (intent.confidence < CLARIFY_THRESHOLD) {
      const draft = await saveDraft(ports, {
        userId: input.userId,
        chatId: input.chatId,
        intent,
        source: input.source,
        kind: "clarify",
      });
      return { kind: "needs_clarification", draftId: draft.id, intent };
    }

    const outcome = await createTaskAndPropose(ports, { userId: input.userId, intent, source: input.source });
    return outcome;
  };
}
