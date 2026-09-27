import { NotFoundError } from "../index";
import type { Instant, Task, TaskId, UserId } from "../index";
import type { PersonalFlowPorts } from "./ports";
import { computeProposal, storeProposal } from "./shared";
import type { ProposeOutcome } from "./shared";

export type ProposeSlotsInput = {
  readonly userId: UserId;
  readonly task: Task;
  /** Search from this instant instead of "now" (used by `nextSlots` to search past the last offered slot). */
  readonly after?: Instant;
};

export type ProposeSlotsResult = ProposeOutcome;

/**
 * Computes and persists a fresh slot proposal for `task`: busy intervals come
 * from `CalendarPort`, slots come only from `SlotScheduler` (never the LLM).
 * An empty result still carries `search.exhausted` so the caller can tell
 * "nothing before the deadline" from "the horizon was reached".
 */
export function createProposeSlots(
  ports: Pick<PersonalFlowPorts, "settings" | "calendar" | "scheduler" | "proposals" | "clock">,
) {
  return async function proposeSlots(input: ProposeSlotsInput): Promise<ProposeSlotsResult> {
    if (input.task.userId !== input.userId) {
      throw new NotFoundError(`Task ${input.task.id as TaskId} does not exist`);
    }
    const now = input.after ?? ports.clock.now();
    const outcome = await computeProposal(ports, { userId: input.userId, task: input.task, now });
    if (outcome.kind === "proposed") {
      await storeProposal(ports, input.userId, outcome.proposal);
    }
    return outcome;
  };
}
