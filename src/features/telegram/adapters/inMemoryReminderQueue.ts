import {
  AlreadyExistsError,
  compareByTimeThenId,
  formatInstant,
  InvalidArgumentError,
  MAX_REMINDER_ATTEMPTS,
  NotFoundError,
  parseInstant,
  ReminderStateError,
  retryDelayMs,
  sanitizeDeliveryError,
} from "../domain";
import type { Reminder, ReminderQueue } from "../domain";

const byDueTime = compareByTimeThenId<Reminder>((reminder) => reminder.dueAt);

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new InvalidArgumentError(`${name} must be a positive integer`);
  }
}

/**
 * In-memory reminder outbox with leases and retry backoff (at-least-once).
 * `claimDue` leases what it returns, so concurrent workers do not both get a
 * reminder until the lease expires. `markFailed` keeps the reminder `pending`
 * with an exponential `nextAttemptAt` until `MAX_REMINDER_ATTEMPTS` failures,
 * then sets `failed`. Cancelling is always scoped to the owning user.
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

  const cancelWhere = (matches: (reminder: Reminder) => boolean): number => {
    let cancelled = 0;
    for (const [id, reminder] of reminders) {
      if (reminder.status === "pending" && matches(reminder)) {
        reminders.set(id, { ...reminder, status: "cancelled", leasedUntil: null });
        cancelled += 1;
      }
    }
    return cancelled;
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
        leasedUntil: null,
        nextAttemptAt: null,
      };
      reminders.set(reminder.id, reminder);
      return { ...reminder };
    },

    async claimDue(now, limit, leaseMs) {
      assertPositiveInteger(limit, "limit");
      assertPositiveInteger(leaseMs, "leaseMs");
      const nowMs = parseInstant(now);
      const leasedUntil = formatInstant(nowMs + leaseMs);
      const isAvailable = (reminder: Reminder): boolean =>
        reminder.status === "pending" &&
        parseInstant(reminder.dueAt) <= nowMs &&
        (reminder.nextAttemptAt === null || parseInstant(reminder.nextAttemptAt) <= nowMs) &&
        (reminder.leasedUntil === null || parseInstant(reminder.leasedUntil) <= nowMs);

      return [...reminders.values()]
        .filter(isAvailable)
        .sort(byDueTime)
        .slice(0, limit)
        .map((reminder) => {
          const leased: Reminder = { ...reminder, leasedUntil };
          reminders.set(leased.id, leased);
          return { ...leased };
        });
    },

    async markSent(id) {
      const updated: Reminder = { ...requirePending(id), status: "sent", leasedUntil: null };
      reminders.set(id, updated);
      return { ...updated };
    },

    async markFailed(id, error, now) {
      const reminder = requirePending(id);
      const nowMs = parseInstant(now);
      const attempts = reminder.attempts + 1;
      const isFinal = attempts >= MAX_REMINDER_ATTEMPTS;
      const updated: Reminder = {
        ...reminder,
        attempts,
        lastError: sanitizeDeliveryError(error),
        leasedUntil: null,
        status: isFinal ? "failed" : "pending",
        nextAttemptAt: isFinal ? null : formatInstant(nowMs + retryDelayMs(attempts)),
      };
      reminders.set(id, updated);
      return { ...updated };
    },

    async cancelForUser(userId) {
      return cancelWhere((reminder) => reminder.userId === userId);
    },

    async cancelForTask(userId, taskId) {
      return cancelWhere((reminder) => reminder.userId === userId && reminder.taskId === taskId);
    },

    async exportForUser(userId) {
      return [...reminders.values()]
        .filter((reminder) => reminder.userId === userId)
        .sort(byDueTime)
        .map((reminder) => ({ ...reminder }));
    },

    async deleteAllForUser(userId) {
      let removed = 0;
      for (const [id, reminder] of reminders) {
        if (reminder.userId === userId) {
          reminders.delete(id);
          removed += 1;
        }
      }
      return removed;
    },
  };
}
