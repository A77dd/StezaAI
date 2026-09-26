import { describe, expect, it } from "vitest";
import {
  addMinutes,
  AlreadyExistsError,
  InvalidArgumentError,
  MAX_REMINDER_ATTEMPTS,
  MAX_REMINDER_ERROR_LENGTH,
  NotFoundError,
  REMINDER_RETRY_BACKOFF_SECONDS,
  ReminderStateError,
} from "../../domain";
import type { NewReminder, ReminderQueue } from "../../domain";
import { makeReminder } from "../domainFixtures";
import { useSubject } from "./harness";
import type { ContractFactory, Mutable } from "./harness";

function newReminder(overrides: Partial<NewReminder> = {}): NewReminder {
  const reminder = makeReminder(overrides);
  return {
    id: reminder.id,
    userId: reminder.userId,
    chatId: reminder.chatId,
    taskId: reminder.taskId,
    kind: reminder.kind,
    dueAt: reminder.dueAt,
  };
}

const at = (seconds: number, from = "2026-09-24T07:00:00.000Z") =>
  addMinutes(from, seconds / 60);

export function describeReminderQueueContract(
  name: string,
  factory: ContractFactory<ReminderQueue>,
): void {
  describe(`${name} satisfies the ReminderQueue contract`, () => {
    const queue = useSubject(factory);
    const due = "2026-09-24T07:00:00.000Z";
    const afterDue = "2026-09-24T07:00:01.000Z";
    const LEASE_MS = 60_000;

    it("schedules a pending reminder with no attempts, lease or retry time", async () => {
      await expect(queue().schedule(newReminder())).resolves.toEqual(makeReminder());
    });

    it("rejects a duplicate id with AlreadyExistsError", async () => {
      await queue().schedule(newReminder());
      await expect(queue().schedule(newReminder())).rejects.toThrow(AlreadyExistsError);
    });

    describe("claimDue", () => {
      it("claims only pending reminders that are due, ordered by dueAt then id, up to limit", async () => {
        await queue().schedule(newReminder({ id: "reminder_b", dueAt: "2026-09-24T07:00:00.000Z" }));
        await queue().schedule(newReminder({ id: "reminder_a", dueAt: "2026-09-24T07:00:00.000Z" }));
        await queue().schedule(newReminder({ id: "reminder_c", dueAt: "2026-09-24T06:00:00.000Z" }));
        await queue().schedule(newReminder({ id: "reminder_d", dueAt: "2026-09-24T08:00:00.000Z" }));

        const now = "2026-09-24T07:30:00.000Z";
        const claimed = await queue().claimDue(now, 2, LEASE_MS);
        expect(claimed.map((reminder) => reminder.id)).toEqual(["reminder_c", "reminder_a"]);
        // The limit leased only two: the next claim gets the rest.
        const rest = await queue().claimDue(now, 10, LEASE_MS);
        expect(rest.map((reminder) => reminder.id)).toEqual(["reminder_b"]);
      });

      it("treats dueAt == now as due and does not claim earlier than dueAt", async () => {
        await queue().schedule(newReminder());
        await expect(queue().claimDue("2026-09-24T06:59:59.999Z", 10, LEASE_MS)).resolves.toEqual([]);
        await expect(queue().claimDue(due, 10, LEASE_MS)).resolves.toHaveLength(1);
      });

      it("leases what it returns: leasedUntil = now + leaseMs, status still pending", async () => {
        await queue().schedule(newReminder());

        const [claimed] = await queue().claimDue(afterDue, 10, LEASE_MS);

        expect(claimed).toMatchObject({
          id: "reminder_1",
          status: "pending",
          leasedUntil: "2026-09-24T07:01:01.000Z",
        });
      });

      it("does not hand a leased reminder to a second claim before the lease expires", async () => {
        await queue().schedule(newReminder());
        await queue().claimDue(afterDue, 10, LEASE_MS);

        await expect(queue().claimDue("2026-09-24T07:01:00.000Z", 10, LEASE_MS)).resolves.toEqual([]);
        await expect(queue().claimDue("2026-09-24T07:01:00.999Z", 10, LEASE_MS)).resolves.toEqual([]);
      });

      it("makes an expired lease claimable again (at-least-once) and extends it", async () => {
        await queue().schedule(newReminder());
        await queue().claimDue(afterDue, 10, LEASE_MS); // leased until 07:01:01

        const [again] = await queue().claimDue("2026-09-24T07:01:01.000Z", 10, LEASE_MS);

        expect(again).toMatchObject({ id: "reminder_1", leasedUntil: "2026-09-24T07:02:01.000Z" });
      });

      it("rejects a non-positive or non-integer limit or lease", async () => {
        await expect(queue().claimDue(afterDue, 0, LEASE_MS)).rejects.toThrow(InvalidArgumentError);
        await expect(queue().claimDue(afterDue, 1.5, LEASE_MS)).rejects.toThrow(InvalidArgumentError);
        await expect(queue().claimDue(afterDue, 1, 0)).rejects.toThrow(InvalidArgumentError);
        await expect(queue().claimDue(afterDue, 1, -5)).rejects.toThrow(InvalidArgumentError);
        await expect(queue().claimDue(afterDue, 1, 0.5)).rejects.toThrow(InvalidArgumentError);
      });
    });

    describe("markSent", () => {
      it("marks a reminder sent, clears the lease and stops claiming it", async () => {
        await queue().schedule(newReminder());
        await queue().claimDue(afterDue, 10, LEASE_MS);

        await expect(queue().markSent("reminder_1")).resolves.toMatchObject({
          status: "sent",
          leasedUntil: null,
        });
        await expect(queue().claimDue("2026-09-25T07:00:00.000Z", 10, LEASE_MS)).resolves.toEqual([]);
      });

      it("throws NotFoundError for unknown ids and ReminderStateError for non-pending ones", async () => {
        await expect(queue().markSent("reminder_missing")).rejects.toThrow(NotFoundError);
        await expect(queue().markFailed("reminder_missing", "boom", afterDue)).rejects.toThrow(
          NotFoundError,
        );

        await queue().schedule(newReminder());
        await queue().markSent("reminder_1");
        await expect(queue().markSent("reminder_1")).rejects.toThrow(ReminderStateError);
        await expect(queue().markFailed("reminder_1", "boom", afterDue)).rejects.toThrow(
          ReminderStateError,
        );
      });
    });

    describe("markFailed", () => {
      it("backs off exponentially, releases the lease and respects nextAttemptAt when claiming", async () => {
        await queue().schedule(newReminder());
        let now = afterDue;

        for (let attempt = 1; attempt < MAX_REMINDER_ATTEMPTS; attempt += 1) {
          const [claimed] = await queue().claimDue(now, 10, LEASE_MS);
          expect(claimed?.id).toBe("reminder_1");

          const delaySeconds = REMINDER_RETRY_BACKOFF_SECONDS[attempt - 1] ?? Number.NaN;
          const failed = await queue().markFailed("reminder_1", `error ${attempt}`, now);
          expect(failed).toMatchObject({
            status: "pending",
            attempts: attempt,
            lastError: `error ${attempt}`,
            leasedUntil: null,
            nextAttemptAt: at(delaySeconds, now),
          });

          // Not claimable one millisecond before the retry time, claimable at it.
          const retryAt = at(delaySeconds, now);
          const justBefore = new Date(Date.parse(retryAt) - 1).toISOString();
          await expect(queue().claimDue(justBefore, 10, LEASE_MS)).resolves.toEqual([]);
          now = retryAt;
        }

        const [last] = await queue().claimDue(now, 10, LEASE_MS);
        expect(last?.id).toBe("reminder_1");
        const final = await queue().markFailed("reminder_1", "final error", now);
        expect(final).toMatchObject({
          status: "failed",
          attempts: MAX_REMINDER_ATTEMPTS,
          lastError: "final error",
          leasedUntil: null,
          nextAttemptAt: null,
        });
        await expect(queue().claimDue("2030-01-01T00:00:00.000Z", 10, LEASE_MS)).resolves.toEqual([]);
        await expect(queue().markFailed("reminder_1", "again", now)).rejects.toThrow(ReminderStateError);
      });

      it("stores the error sanitized: newlines collapsed and at most 200 characters", async () => {
        await queue().schedule(newReminder());
        const messy = `Forbidden:\nbot was blocked\r\n\tby the user ${"x".repeat(500)}`;

        const failed = await queue().markFailed("reminder_1", messy, afterDue);

        expect(failed.lastError).not.toMatch(/[\r\n\t]/);
        expect(Array.from(failed.lastError ?? "").length).toBeLessThanOrEqual(MAX_REMINDER_ERROR_LENGTH);
        expect(failed.lastError?.startsWith("Forbidden: bot was blocked by the user")).toBe(true);
      });
    });

    describe("cancelling", () => {
      it("cancelForUser cancels only the given user's pending reminders", async () => {
        await queue().schedule(newReminder({ id: "reminder_1" }));
        await queue().schedule(newReminder({ id: "reminder_2" }));
        await queue().schedule(newReminder({ id: "reminder_3" }));
        await queue().schedule(newReminder({ id: "reminder_4", userId: "user_2" }));
        await queue().markSent("reminder_3");

        await expect(queue().cancelForUser("user_1")).resolves.toBe(2);
        const claimed = await queue().claimDue(afterDue, 10, LEASE_MS);
        expect(claimed.map((reminder) => reminder.id)).toEqual(["reminder_4"]);
        await expect(queue().cancelForUser("user_1")).resolves.toBe(0);
        await expect(queue().markSent("reminder_1")).rejects.toThrow(ReminderStateError);
      });

      it("cancelForTask cancels only that task's pending reminders of that user", async () => {
        await queue().schedule(newReminder({ id: "reminder_1", taskId: "task_1" }));
        await queue().schedule(newReminder({ id: "reminder_2", taskId: "task_1", kind: "check_in" }));
        await queue().schedule(newReminder({ id: "reminder_3", taskId: "task_2" }));
        await queue().schedule(newReminder({ id: "reminder_4", taskId: "task_1" }));
        await queue().markSent("reminder_4");

        await expect(queue().cancelForTask("user_1", "task_1")).resolves.toBe(2);

        const claimed = await queue().claimDue(afterDue, 10, LEASE_MS);
        expect(claimed.map((reminder) => reminder.id)).toEqual(["reminder_3"]);
        await expect(queue().cancelForTask("user_1", "task_1")).resolves.toBe(0);
        await expect(queue().cancelForTask("user_1", "task_missing")).resolves.toBe(0);
      });

      describe("ownership (task ids come from forgeable callback data)", () => {
        it("user_2 cannot cancel user_1's reminders through cancelForTask", async () => {
          await queue().schedule(newReminder({ id: "reminder_1", taskId: "task_1" }));

          await expect(queue().cancelForTask("user_2", "task_1")).resolves.toBe(0);

          const claimed = await queue().claimDue(afterDue, 10, LEASE_MS);
          expect(claimed.map((reminder) => reminder.id)).toEqual(["reminder_1"]);
        });

        it("user_2's cancelForUser never touches user_1's reminders", async () => {
          await queue().schedule(newReminder({ id: "reminder_1" }));
          await expect(queue().cancelForUser("user_2")).resolves.toBe(0);
          await expect(queue().claimDue(afterDue, 10, LEASE_MS)).resolves.toHaveLength(1);
        });
      });
    });

    it("returns copies: mutating results or inputs never changes stored state", async () => {
      const input = newReminder();
      const scheduled = await queue().schedule(input);
      (input as Mutable<NewReminder>).dueAt = "2030-01-01T00:00:00.000Z";
      (scheduled as Mutable<typeof scheduled>).status = "sent";
      const claimed = await queue().claimDue(afterDue, 10, LEASE_MS);
      (claimed[0] as Mutable<(typeof claimed)[number]>).status = "cancelled";

      const later = await queue().claimDue("2026-09-24T07:05:00.000Z", 10, LEASE_MS);
      expect(later).toHaveLength(1);
      expect(later[0]).toMatchObject({ status: "pending", dueAt: due });
    });
  });
}
