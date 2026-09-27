import type { UserId } from "../index";
import type { PersonalFlowPorts } from "./ports";

export type DeleteUserDataResult = {
  readonly tasks: number;
  readonly bookings: number;
  readonly proposals: number;
  readonly drafts: number;
  readonly pendingInputs: number;
  readonly settings: number;
  readonly memory: number;
  readonly reminders: number;
  readonly callbackTokens: number;
};

type DeleteUserDataPorts = Pick<
  PersonalFlowPorts,
  "tasks" | "settings" | "drafts" | "proposals" | "pendingInputs" | "memory" | "reminders" | "calendar" | "callbackTokens"
>;

/**
 * `/deleteme`: erases everything the layer stores about the user, across
 * every repository, queue and store, and reports how many rows were removed
 * from each. Idempotent: calling it again with nothing left to delete returns
 * all-zero counts rather than failing.
 */
export function createDeleteUserData(ports: DeleteUserDataPorts) {
  return async function deleteUserData(input: { readonly userId: UserId }): Promise<DeleteUserDataResult> {
    // Read the bookings to delete before the owning tasks are gone.
    const tasks = await ports.tasks.exportForUser(input.userId);
    const bookingIds = tasks
      .map((task) => task.bookingId)
      .filter((bookingId): bookingId is string => bookingId !== null);
    for (const bookingId of bookingIds) {
      await ports.calendar.deleteBlock(input.userId, bookingId);
    }

    const existingSettings = await ports.settings.get(input.userId);
    if (existingSettings !== null) {
      await ports.settings.delete(input.userId);
    }

    const [taskCount, proposalCount, draftCount, pendingInputCount, memoryCount, reminderCount, tokenCount] =
      await Promise.all([
        ports.tasks.deleteAllForUser(input.userId),
        ports.proposals.deleteAllForUser(input.userId),
        ports.drafts.deleteAllForUser(input.userId),
        ports.pendingInputs.deleteAllForUser(input.userId),
        ports.memory.deleteAllForUser(input.userId),
        ports.reminders.deleteAllForUser(input.userId),
        ports.callbackTokens.revokeForUser(input.userId),
      ]);

    return {
      tasks: taskCount,
      bookings: bookingIds.length,
      proposals: proposalCount,
      drafts: draftCount,
      pendingInputs: pendingInputCount,
      settings: existingSettings === null ? 0 : 1,
      memory: memoryCount,
      reminders: reminderCount,
      callbackTokens: tokenCount,
    };
  };
}
