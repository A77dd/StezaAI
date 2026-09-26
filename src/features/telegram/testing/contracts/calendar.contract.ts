import { describe, expect, it } from "vitest";
import { InvalidTimeError, NotFoundError, SlotConflictError } from "../../domain";
import type { CalendarPort, Interval } from "../../domain";
import { captureRejection, useSubject } from "./harness";
import type { ContractFactory, Mutable } from "./harness";

const iv = (start: string, end: string): Interval => ({ start, end });

export function describeCalendarPortContract(
  name: string,
  factory: ContractFactory<CalendarPort>,
): void {
  describe(`${name} satisfies the CalendarPort contract`, () => {
    const calendar = useSubject(factory);
    const slot = iv("2026-09-28T07:00:00.000Z", "2026-09-28T08:00:00.000Z");
    const day = iv("2026-09-28T00:00:00.000Z", "2026-09-29T00:00:00.000Z");
    const input = { userId: "user_1", taskId: "task_1", title: "Подготовить презентацию", slot };

    it("creates a block and reports it as busy for that user only", async () => {
      const booking = await calendar().createBlock(input);

      expect(booking).toMatchObject({ taskId: "task_1", userId: "user_1", slot });
      expect(booking.id).not.toBe("");
      expect(booking.calendarEventId).not.toBe("");
      await expect(calendar().getBusyIntervals("user_1", day)).resolves.toEqual([slot]);
      await expect(calendar().getBusyIntervals("user_2", day)).resolves.toEqual([]);
    });

    it("only returns busy intervals that overlap the requested range, sorted by start", async () => {
      const later = iv("2026-09-28T09:00:00.000Z", "2026-09-28T10:00:00.000Z");
      await calendar().createBlock({ ...input, taskId: "task_2", slot: later });
      await calendar().createBlock(input);
      await calendar().createBlock({
        ...input,
        taskId: "task_3",
        slot: iv("2026-09-30T07:00:00.000Z", "2026-09-30T08:00:00.000Z"),
      });

      await expect(calendar().getBusyIntervals("user_1", day)).resolves.toEqual([slot, later]);
    });

    it("rejects an overlapping block with SlotConflictError", async () => {
      await calendar().createBlock(input);
      await expect(
        calendar().createBlock({
          ...input,
          taskId: "task_2",
          slot: iv("2026-09-28T07:30:00.000Z", "2026-09-28T08:30:00.000Z"),
        }),
      ).rejects.toThrow(SlotConflictError);
    });

    it("allows back-to-back blocks and identical slots for different users", async () => {
      await calendar().createBlock(input);
      await expect(
        calendar().createBlock({
          ...input,
          taskId: "task_2",
          slot: iv("2026-09-28T08:00:00.000Z", "2026-09-28T09:00:00.000Z"),
        }),
      ).resolves.toBeDefined();
      await expect(
        calendar().createBlock({ ...input, userId: "user_2", taskId: "task_3" }),
      ).resolves.toBeDefined();
    });

    it("rejects empty or reversed slots", async () => {
      await expect(
        calendar().createBlock({
          ...input,
          slot: iv("2026-09-28T08:00:00.000Z", "2026-09-28T07:00:00.000Z"),
        }),
      ).rejects.toThrow(InvalidTimeError);
    });

    it("moves a block, allowing overlap with its own previous position", async () => {
      const booking = await calendar().createBlock(input);
      const moved = iv("2026-09-28T07:30:00.000Z", "2026-09-28T08:30:00.000Z");

      const updated = await calendar().updateBlock("user_1", booking.id, moved);

      expect(updated).toMatchObject({ id: booking.id, taskId: "task_1", slot: moved });
      await expect(calendar().getBusyIntervals("user_1", day)).resolves.toEqual([moved]);
    });

    it("rejects moving a block onto another block", async () => {
      const first = await calendar().createBlock(input);
      await calendar().createBlock({
        ...input,
        taskId: "task_2",
        slot: iv("2026-09-28T09:00:00.000Z", "2026-09-28T10:00:00.000Z"),
      });

      await expect(
        calendar().updateBlock(
          "user_1",
          first.id,
          iv("2026-09-28T09:30:00.000Z", "2026-09-28T10:30:00.000Z"),
        ),
      ).rejects.toThrow(SlotConflictError);
      await expect(calendar().getBusyIntervals("user_1", day)).resolves.toContainEqual(slot);
    });

    it("throws NotFoundError when updating an unknown booking", async () => {
      await expect(calendar().updateBlock("user_1", "booking_missing", slot)).rejects.toThrow(
        NotFoundError,
      );
    });

    it("deletes a block and frees its slot", async () => {
      const booking = await calendar().createBlock(input);
      await calendar().deleteBlock("user_1", booking.id);

      await expect(calendar().getBusyIntervals("user_1", day)).resolves.toEqual([]);
      await expect(calendar().createBlock({ ...input, taskId: "task_2" })).resolves.toBeDefined();
    });

    it("is NOT idempotent on delete: unknown or already deleted ids throw NotFoundError", async () => {
      const booking = await calendar().createBlock(input);
      await calendar().deleteBlock("user_1", booking.id);

      await expect(calendar().deleteBlock("user_1", booking.id)).rejects.toThrow(NotFoundError);
      await expect(calendar().deleteBlock("user_1", "booking_missing")).rejects.toThrow(NotFoundError);
    });

    describe("ownership (booking ids come from forgeable callback data)", () => {
      it("user_2 cannot update user_1's booking, and the booking is untouched", async () => {
        const booking = await calendar().createBlock(input);

        await expect(
          calendar().updateBlock(
            "user_2",
            booking.id,
            iv("2026-09-28T12:00:00.000Z", "2026-09-28T13:00:00.000Z"),
          ),
        ).rejects.toThrow(NotFoundError);

        await expect(calendar().getBusyIntervals("user_1", day)).resolves.toEqual([slot]);
        await expect(calendar().getBusyIntervals("user_2", day)).resolves.toEqual([]);
      });

      it("user_2 cannot delete user_1's booking, and the booking is untouched", async () => {
        const booking = await calendar().createBlock(input);

        await expect(calendar().deleteBlock("user_2", booking.id)).rejects.toThrow(NotFoundError);

        await expect(calendar().getBusyIntervals("user_1", day)).resolves.toEqual([slot]);
        await expect(calendar().deleteBlock("user_1", booking.id)).resolves.toBeUndefined();
      });

      it("does not reveal existence: another user's booking fails exactly like a missing one", async () => {
        const booking = await calendar().createBlock(input);
        const foreign = iv("2026-09-28T12:00:00.000Z", "2026-09-28T13:00:00.000Z");

        const missingUpdate = await captureRejection(
          calendar().updateBlock("user_2", "booking_missing", foreign),
        );
        const foreignUpdate = await captureRejection(
          calendar().updateBlock("user_2", booking.id, foreign),
        );
        const missingDelete = await captureRejection(calendar().deleteBlock("user_2", "booking_missing"));
        const foreignDelete = await captureRejection(calendar().deleteBlock("user_2", booking.id));

        expect(foreignUpdate.constructor).toBe(missingUpdate.constructor);
        expect(foreignDelete.constructor).toBe(missingDelete.constructor);
        expect(foreignUpdate.message.replace(booking.id, "ID")).toBe(
          missingUpdate.message.replace("booking_missing", "ID"),
        );
        expect(foreignDelete.message.replace(booking.id, "ID")).toBe(
          missingDelete.message.replace("booking_missing", "ID"),
        );
      });

      it("a foreign update cannot be used to probe for conflicts either", async () => {
        const first = await calendar().createBlock(input);
        await calendar().createBlock({ ...input, userId: "user_2", taskId: "task_2", slot: iv("2026-09-28T09:00:00.000Z", "2026-09-28T10:00:00.000Z") });

        // Not SlotConflictError: ownership is checked before anything about the slot.
        await expect(
          calendar().updateBlock("user_2", first.id, iv("2026-09-28T09:00:00.000Z", "2026-09-28T10:00:00.000Z")),
        ).rejects.toThrow(NotFoundError);
      });
    });

    it("returns copies: mutating results or inputs never changes stored state", async () => {
      const mutableInput = { ...input, slot: { ...slot } };
      const booking = await calendar().createBlock(mutableInput);
      mutableInput.slot.start = "2026-09-28T00:00:00.000Z";
      (booking.slot as Mutable<Interval>).start = "2026-09-28T00:00:00.000Z";
      const busy = await calendar().getBusyIntervals("user_1", day);
      (busy[0] as Mutable<Interval>).end = "2026-09-28T23:00:00.000Z";

      await expect(calendar().getBusyIntervals("user_1", day)).resolves.toEqual([slot]);
    });
  });
}
