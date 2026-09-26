import { NotFoundError, SlotConflictError } from "../domain/errors";
import { assertValidInterval, intervalsOverlap } from "../domain/intervals";
import type { CalendarPort, IdGenerator } from "../domain/ports";
import { parseInstant } from "../domain/time";
import type { BlockBooking, Interval, UserId } from "../domain/types";

export type InMemoryCalendar = CalendarPort & {
  /**
   * Seeds an event that the user already has in the calendar (a meeting the
   * bot did not create). It shows up as busy but is not a bot-managed block,
   * so it never causes `SlotConflictError`: real calendars allow overlaps and
   * avoiding them is the scheduler's job.
   */
  addBusyInterval(userId: UserId, interval: Interval): void;
};

function compareIntervals(a: Interval, b: Interval): number {
  return parseInstant(a.start) - parseInstant(b.start) || parseInstant(a.end) - parseInstant(b.end);
}

/**
 * In-memory calendar for tests and demos.
 *
 * Rules (also asserted by the shared contract):
 * - blocks are half-open; back-to-back blocks are allowed;
 * - `createBlock` / `updateBlock` throw `SlotConflictError` when the slot
 *   overlaps another block of the same user (a block never conflicts with its
 *   own previous position);
 * - `deleteBlock` is NOT idempotent: an unknown or already deleted id throws
 *   `NotFoundError`, so a double "cancel" tap is visible to the caller.
 */
export function createInMemoryCalendar(options: { ids: IdGenerator }): InMemoryCalendar {
  const blocks = new Map<string, BlockBooking>();
  const external = new Map<UserId, Interval[]>();

  const assertNoConflict = (userId: UserId, slot: Interval, ignoreId?: string): void => {
    for (const block of blocks.values()) {
      if (block.userId === userId && block.id !== ignoreId && intervalsOverlap(block.slot, slot)) {
        throw new SlotConflictError("The slot overlaps an existing calendar block");
      }
    }
  };

  return {
    addBusyInterval(userId, interval) {
      assertValidInterval(interval);
      external.set(userId, [...(external.get(userId) ?? []), { ...interval }]);
    },

    async getBusyIntervals(userId, range) {
      assertValidInterval(range);
      const busy = [
        ...(external.get(userId) ?? []),
        ...[...blocks.values()].filter((block) => block.userId === userId).map((block) => block.slot),
      ];
      return busy
        .filter((interval) => intervalsOverlap(interval, range))
        .sort(compareIntervals)
        .map((interval) => ({ ...interval }));
    },

    async createBlock(input) {
      assertValidInterval(input.slot);
      assertNoConflict(input.userId, input.slot);
      const booking: BlockBooking = {
        id: options.ids.next("booking"),
        taskId: input.taskId,
        userId: input.userId,
        slot: { ...input.slot },
        calendarEventId: options.ids.next("event"),
      };
      blocks.set(booking.id, booking);
      return structuredClone(booking);
    },

    async updateBlock(bookingId, slot) {
      const existing = blocks.get(bookingId);
      if (existing === undefined) {
        throw new NotFoundError(`Booking ${bookingId} does not exist`);
      }
      assertValidInterval(slot);
      assertNoConflict(existing.userId, slot, bookingId);
      const updated: BlockBooking = { ...existing, slot: { ...slot } };
      blocks.set(bookingId, updated);
      return structuredClone(updated);
    },

    async deleteBlock(bookingId) {
      if (!blocks.delete(bookingId)) {
        throw new NotFoundError(`Booking ${bookingId} does not exist`);
      }
    },
  };
}
