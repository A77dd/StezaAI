import { NotFoundError } from "../index";
import type { Task, TaskId, UserId } from "../index";
import type { PersonalFlowPorts } from "./ports";

export type CancelTaskInput = {
  readonly userId: UserId;
  readonly taskId: TaskId;
};

export type CancelTaskResult =
  | { readonly kind: "cancelled"; readonly task: Task }
  | { readonly kind: "already_cancelled"; readonly task: Task };

/**
 * Cancels a task: deletes its calendar block (if any), cancels its pending
 * reminders and its stored proposal (if any), and marks it `cancelled`.
 * Idempotent: cancelling an already-cancelled task is a no-op that reports
 * `already_cancelled` instead of touching anything a second time (`deleteBlock`
 * is not itself idempotent, so this use-case never calls it twice for the
 * same booking).
 */
export function createCancelTask(ports: Pick<PersonalFlowPorts, "tasks" | "calendar" | "reminders" | "proposals">) {
  return async function cancelTask(input: CancelTaskInput): Promise<CancelTaskResult> {
    const task = await ports.tasks.get(input.userId, input.taskId);
    if (task === null) {
      throw new NotFoundError(`Task ${input.taskId} does not exist`);
    }
    if (task.status === "cancelled") {
      return { kind: "already_cancelled", task };
    }

    if (task.bookingId !== null) {
      await ports.calendar.deleteBlock(input.userId, task.bookingId);
    }
    await ports.reminders.cancelForTask(input.userId, task.id);
    await ports.proposals.delete(input.userId, task.id);

    const cancelled = await ports.tasks.update(input.userId, task.id, {
      status: "cancelled",
      bookingId: null,
    });
    return { kind: "cancelled", task: cancelled };
  };
}
