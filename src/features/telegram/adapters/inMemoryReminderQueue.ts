import {
  AlreadyExistsError,
  MAX_REMINDER_ATTEMPTS,
  NotFoundError,
  parseInstant,
  ReminderStateError,
} from "../domain";
import type { Reminder, ReminderQueue } from "../domain";

function compareReminders(a: Reminder, b: Reminder): number {
  const byDue = parseInstant(a.dueAt) - parseInstant(b.dueAt);
  if (byDue !== 0) return byDue;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * In-memory reminder outbox. `claimDue` is a read: it neither locks nor marks,
 * so two workers could see the same reminder; delivery must be idempotent
 * (at-least-once). Retry policy: `markFailed` keeps the reminder `pending`
 * until `MAX_REMINDER_ATTEMPTS` failures, then sets `failed`.
 */
export function createInMemoryReminderQueue(): ReminderQueue {
  const reminders = new Map<string, Reminder>();

  const requirePending = (id: string): Reminder => {
    const reminder = reminders.get(id);
    if (reminder === undefined) {
      throw new NotFoundError(`Reminder ${id} does not exist`);
    }
    if (reminder.status !== "pending") {
      throw new ReminderStateError(`Reminder ${id} is ${reminder.status}, not pending`);
    }
    return reminder;
  };

  return {
    async schedule(input) {
      parseInstant(input.dueAt);
      if (reminders.has(input.id)) {
        throw new AlreadyExistsError(`Reminder ${input.id} already exists`);
      }
      const reminder: Reminder = {
        id: input.id,
        userId: input.userId,
        chatId: input.chatId,
        taskId: input.taskId,
        kind: input.kind,
        dueAt: input.dueAt,
        status: "pending",
        attempts: 0,
        lastError: null,
      };
      reminders.set(reminder.id, reminder);
      return { ...reminder };
    },

    async claimDue(now, limit) {
      if (!Number.isInteger(limit) || limit < 1) {
        throw new RangeError("limit must be a positive integer");
      }
      const nowMs = parseInstant(now);
      return [...reminders.values()]
        .filter((reminder) => reminder.status === "pending" && parseInstant(reminder.dueAt) <= nowMs)
        .sort(compareReminders)
        .slice(0, limit)
        .map((reminder) => ({ ...reminder }));
    },

    async markSent(id) {
      const updated: Reminder = { ...requirePending(id), status: "sent" };
      reminders.set(id, updated);
      return { ...updated };
    },

    async markFailed(id, error) {
      const reminder = requirePending(id);
      const attempts = reminder.attempts + 1;
      const updated: Reminder = {
        ...reminder,
        attempts,
        lastError: error,
        status: attempts >= MAX_REMINDER_ATTEMPTS ? "failed" : "pending",
      };
      reminders.set(id, updated);
      return { ...updated };
    },

    async cancelForUser(userId) {
      let cancelled = 0;
      for (const [id, reminder] of reminders) {
        if (reminder.userId === userId && reminder.status === "pending") {
          reminders.set(id, { ...reminder, status: "cancelled" });
          cancelled += 1;
        }
      }
      return cancelled;
    },
  };
}
