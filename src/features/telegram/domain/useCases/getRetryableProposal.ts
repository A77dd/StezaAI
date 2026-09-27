import type { SlotProposal, Task, TaskId, UserId } from "../index";
import type { PersonalFlowPorts } from "./ports";

export type RetryableProposal = {
  readonly task: Task;
  readonly proposal: SlotProposal;
};

export type GetRetryableProposalInput = {
  readonly userId: UserId;
  readonly taskId: TaskId;
};

/** Loads the unchanged proposal after a failed confirmation has restored the task to `proposed`. */
export function createGetRetryableProposal(
  ports: Pick<PersonalFlowPorts, "tasks" | "proposals">,
) {
  return async function getRetryableProposal(input: GetRetryableProposalInput): Promise<RetryableProposal | null> {
    const task = await ports.tasks.get(input.userId, input.taskId);
    if (task === null || task.status !== "proposed") return null;

    const stored = await ports.proposals.get(input.userId, input.taskId);
    if (stored === null) return null;

    return { task, proposal: { taskId: stored.taskId, slots: stored.slots } };
  };
}
