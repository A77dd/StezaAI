import { NotFoundError } from "../index";
import type { SlotProposal, Task, TaskId, UserId } from "../index";
import type { PersonalFlowPorts } from "./ports";
import { computeProposal, storeProposal } from "./shared";
import type { SlotSearchSummary } from "./shared";

export type NextSlotsInput = {
  readonly userId: UserId;
  readonly taskId: TaskId;
};

export type NextSlotsResult =
  | { readonly kind: "proposed"; readonly task: Task; readonly proposal: SlotProposal; readonly search: SlotSearchSummary }
  | { readonly kind: "no_more_slots"; readonly search: SlotSearchSummary };

/**
 * "Другое время": searches again starting after the end of the last offered
 * slot, so the new proposal never repeats one already shown, and replaces the
 * stored proposal. Only meaningful while the task is still `proposed`.
 */
export function createNextSlots(
  ports: Pick<PersonalFlowPorts, "tasks" | "proposals" | "settings" | "calendar" | "scheduler" | "clock">,
) {
  return async function nextSlots(input: NextSlotsInput): Promise<NextSlotsResult> {
    const task = await ports.tasks.get(input.userId, input.taskId);
    if (task === null) {
      throw new NotFoundError(`Task ${input.taskId} does not exist`);
    }
    const stored = await ports.proposals.get(input.userId, input.taskId);
    if (stored === null) {
      throw new NotFoundError(`No slot proposal exists for task ${input.taskId}`);
    }

    const lastSlot = stored.slots.at(-1);
    const after = lastSlot === undefined ? ports.clock.now() : lastSlot.end;
    const outcome = await computeProposal(ports, { userId: input.userId, task, now: after });
    if (outcome.kind === "no_slots") {
      return { kind: "no_more_slots", search: outcome.search };
    }

    // The search already starts after the last slot's end, but guard against a
    // scheduler that (legitimately) returns a slot touching an old boundary.
    const previous = new Set(stored.slots.map((slot) => `${slot.start}|${slot.end}`));
    const fresh = outcome.proposal.slots.filter((slot) => !previous.has(`${slot.start}|${slot.end}`));
    if (fresh.length === 0) {
      return { kind: "no_more_slots", search: outcome.search };
    }

    const proposal: SlotProposal = { taskId: task.id, slots: fresh };
    await storeProposal(ports, input.userId, proposal);
    return { kind: "proposed", task, proposal, search: outcome.search };
  };
}
