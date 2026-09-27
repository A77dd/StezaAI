import type { BlockBooking, Instant, MemoryRecord, Reminder, Task, UserId, UserSettings } from "../index";
import type { PersonalFlowPorts } from "./ports";

/** Bumped whenever the shape of `ExportedUserData` changes, so consumers can migrate. */
export const EXPORT_SCHEMA_VERSION = 1;

export type ExportedUserData = {
  readonly schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  readonly generatedAt: Instant;
  readonly settings: UserSettings | null;
  /** Every task the user has, including its source text, in every status. */
  readonly tasks: readonly Task[];
  /** The current calendar block of every task that has one. */
  readonly bookings: readonly BlockBooking[];
  readonly memory: readonly MemoryRecord[];
  /** Every reminder of the user, in every status. */
  readonly reminders: readonly Reminder[];
};

type ExportUserDataPorts = Pick<PersonalFlowPorts, "settings" | "tasks" | "calendar" | "memory" | "reminders" | "clock">;

/**
 * Everything the layer stores about the user, as one plain, JSON-safe object
 * (AGENTS.md: privacy by design, a user-visible way to inspect their data).
 * `bookings` is derived from tasks (`CalendarPort` has no "list all" method by
 * design; a booking always belongs to exactly one task).
 */
export function createExportUserData(ports: ExportUserDataPorts) {
  return async function exportUserData(input: { readonly userId: UserId }): Promise<ExportedUserData> {
    const [settings, tasks, memory, reminders] = await Promise.all([
      ports.settings.get(input.userId),
      ports.tasks.exportForUser(input.userId),
      ports.memory.listByUser(input.userId),
      ports.reminders.exportForUser(input.userId),
    ]);

    const bookingIds = tasks
      .map((task) => task.bookingId)
      .filter((bookingId): bookingId is string => bookingId !== null);
    const bookings = (
      await Promise.all(bookingIds.map((bookingId) => ports.calendar.getBlock(input.userId, bookingId)))
    ).filter((booking): booking is BlockBooking => booking !== null);

    return {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      generatedAt: ports.clock.now(),
      settings,
      tasks,
      bookings,
      memory,
      reminders,
    };
  };
}
