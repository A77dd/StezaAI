import { describe, expect, it } from "vitest";
import {
  AlreadyExistsError,
  InvalidTimeError,
  NotFoundError,
  ReminderStateError,
  SlotConflictError,
} from "../domain/errors";
import { intervalsOverlap } from "../domain/intervals";
import type {
  CalendarPort,
  ReminderQueue,
  SlotScheduler,
  TaskRepository,
} from "../domain/ports";
import { parseClockTime, parseInstant, toZonedParts } from "../domain/time";
import { MAX_REMINDER_ATTEMPTS } from "../domain/types";
import type { Interval, NewReminder, Task, UserSettings } from "../domain/types";
import { makeReminder, makeSettings, makeSource, makeTask } from "../testing/domainFixtures";

/**
 * Reusable contract suites for the domain ports. Each takes a factory that
 * returns a FRESH implementation and registers `describe`/`it` blocks, so every
 * adapter test file can run the shared contract next to its own tests.
 */

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const iv = (start: string, end: string): Interval => ({ start, end });

// --- SlotScheduler ----------------------------------------------------------

type SchedulerScenario = {
  readonly name: string;
  readonly task: Pick<Task, "id" | "deadline" | "durationMinutes" | "priority">;
  readonly busy: Interval[];
  readonly settings: UserSettings;
  readonly now: string;
};

// Monday 2026-09-28 09:10 in Moscow (UTC+3, no DST).
const MONDAY_MORNING = "2026-09-28T06:10:00.000Z";

const schedulerScenarios: SchedulerScenario[] = [
  {
    name: "empty calendar, no deadline",
    task: { id: "task_1", deadline: null, durationMinutes: 60, priority: "normal" },
    busy: [],
    settings: makeSettings(),
    now: MONDAY_MORNING,
  },
  {
    name: "busy morning and lunch",
    task: { id: "task_1", deadline: null, durationMinutes: 90, priority: "normal" },
    busy: [
      iv("2026-09-28T06:00:00.000Z", "2026-09-28T08:00:00.000Z"),
      iv("2026-09-28T09:00:00.000Z", "2026-09-28T10:00:00.000Z"),
      iv("2026-09-29T06:00:00.000Z", "2026-09-29T15:00:00.000Z"),
    ],
    settings: makeSettings(),
    now: MONDAY_MORNING,
  },
  {
    name: "deadline on Wednesday evening",
    task: {
      id: "task_1",
      deadline: "2026-09-30T20:59:00.000Z",
      durationMinutes: 120,
      priority: "normal",
    },
    busy: [iv("2026-09-28T07:00:00.000Z", "2026-09-28T09:00:00.000Z")],
    settings: makeSettings(),
    now: MONDAY_MORNING,
  },
  {
    name: "high priority",
    task: { id: "task_1", deadline: null, durationMinutes: 30, priority: "high" },
    busy: [],
    settings: makeSettings(),
    now: MONDAY_MORNING,
  },
  {
    name: "low priority with default block length",
    task: { id: "task_1", deadline: null, durationMinutes: null, priority: "low" },
    busy: [],
    settings: makeSettings({ defaultBlockMinutes: 45 }),
    now: MONDAY_MORNING,
  },
  {
    name: "Friday evening spills over the weekend",
    task: { id: "task_1", deadline: null, durationMinutes: 60, priority: "normal" },
    busy: [],
    settings: makeSettings(),
    now: "2026-10-02T14:10:00.000Z",
  },
  {
    name: "different timezone and shifted working hours",
    task: { id: "task_1", deadline: null, durationMinutes: 60, priority: "normal" },
    busy: [],
    settings: makeSettings({
      timezone: "America/New_York",
      workingHours: { isoDays: [1, 2, 3, 4, 5], start: "10:00", end: "16:00" },
    }),
    now: MONDAY_MORNING,
  },
];

function requestedMinutes(scenario: SchedulerScenario): number {
  return scenario.task.durationMinutes ?? scenario.settings.defaultBlockMinutes;
}

function assertInsideWorkingHours(slot: Interval, settings: UserSettings): void {
  const start = toZonedParts(slot.start, settings.timezone);
  const end = toZonedParts(slot.end, settings.timezone);
  expect(settings.workingHours.isoDays).toContain(start.isoWeekday);
  // The block must fit inside ONE working window: same local date at both ends.
  expect([end.year, end.month, end.day]).toEqual([start.year, start.month, start.day]);
  const from = parseClockTime(settings.workingHours.start);
  const to = parseClockTime(settings.workingHours.end);
  expect(start.hour * 60 + start.minute).toBeGreaterThanOrEqual(from);
  expect(end.hour * 60 + end.minute).toBeLessThanOrEqual(to);
}

export function describeSlotSchedulerContract(
  name: string,
  createScheduler: () => SlotScheduler,
): void {
  describe(`${name} satisfies the SlotScheduler contract`, () => {
    describe.each(schedulerScenarios)("$name", (scenario) => {
      const propose = () =>
        createScheduler().propose({
          task: scenario.task,
          busy: scenario.busy,
          settings: scenario.settings,
          now: scenario.now,
        });

      it("returns 1-3 slots when free time exists", () => {
        const slots = propose();
        expect(slots.length).toBeGreaterThanOrEqual(1);
        expect(slots.length).toBeLessThanOrEqual(3);
      });

      it("never overlaps a busy interval", () => {
        for (const slot of propose()) {
          for (const busy of scenario.busy) {
            expect(intervalsOverlap(slot, busy)).toBe(false);
          }
        }
      });

      it("stays inside working hours of working days", () => {
        for (const slot of propose()) {
          assertInsideWorkingHours(slot, scenario.settings);
        }
      });

      it("starts no earlier than now and ends no later than the deadline", () => {
        for (const slot of propose()) {
          expect(parseInstant(slot.start)).toBeGreaterThanOrEqual(parseInstant(scenario.now));
          if (scenario.task.deadline !== null) {
            expect(parseInstant(slot.end)).toBeLessThanOrEqual(parseInstant(scenario.task.deadline));
          }
        }
      });

      it("gives each slot exactly the requested duration", () => {
        for (const slot of propose()) {
          const minutes = (parseInstant(slot.end) - parseInstant(slot.start)) / 60_000;
          expect(minutes).toBe(requestedMinutes(scenario));
        }
      });

      it("orders slots by start and never repeats one", () => {
        const starts = propose().map((slot) => parseInstant(slot.start));
        expect(starts).toEqual([...starts].sort((a, b) => a - b));
        expect(new Set(starts).size).toBe(starts.length);
      });

      it("is deterministic across calls and instances", () => {
        expect(propose()).toEqual(propose());
      });
    });

    it("returns an empty array when there is no free time", () => {
      const slots = createScheduler().propose({
        task: { id: "task_1", deadline: null, durationMinutes: 60, priority: "normal" },
        busy: [iv("2026-09-28T00:00:00.000Z", "2026-10-30T00:00:00.000Z")],
        settings: makeSettings(),
        now: MONDAY_MORNING,
      });
      expect(slots).toEqual([]);
    });
  });
}

// --- CalendarPort -----------------------------------------------------------

export function describeCalendarPortContract(
  name: string,
  createCalendar: () => CalendarPort,
): void {
  describe(`${name} satisfies the CalendarPort contract`, () => {
    const slot = iv("2026-09-28T07:00:00.000Z", "2026-09-28T08:00:00.000Z");
    const day = iv("2026-09-28T00:00:00.000Z", "2026-09-29T00:00:00.000Z");
    const input = { userId: "user_1", taskId: "task_1", title: "Подготовить презентацию", slot };

    it("creates a block and reports it as busy for that user only", async () => {
      const calendar = createCalendar();
      const booking = await calendar.createBlock(input);

      expect(booking).toMatchObject({ taskId: "task_1", userId: "user_1", slot });
      expect(booking.id).not.toBe("");
      expect(booking.calendarEventId).not.toBe("");
      await expect(calendar.getBusyIntervals("user_1", day)).resolves.toEqual([slot]);
      await expect(calendar.getBusyIntervals("user_2", day)).resolves.toEqual([]);
    });

    it("only returns busy intervals that overlap the requested range, sorted by start", async () => {
      const calendar = createCalendar();
      const later = iv("2026-09-28T09:00:00.000Z", "2026-09-28T10:00:00.000Z");
      await calendar.createBlock({ ...input, taskId: "task_2", slot: later });
      await calendar.createBlock(input);
      await calendar.createBlock({
        ...input,
        taskId: "task_3",
        slot: iv("2026-09-30T07:00:00.000Z", "2026-09-30T08:00:00.000Z"),
      });

      await expect(calendar.getBusyIntervals("user_1", day)).resolves.toEqual([slot, later]);
    });

    it("rejects an overlapping block with SlotConflictError", async () => {
      const calendar = createCalendar();
      await calendar.createBlock(input);
      await expect(
        calendar.createBlock({
          ...input,
          taskId: "task_2",
          slot: iv("2026-09-28T07:30:00.000Z", "2026-09-28T08:30:00.000Z"),
        }),
      ).rejects.toThrow(SlotConflictError);
    });

    it("allows back-to-back blocks and identical slots for different users", async () => {
      const calendar = createCalendar();
      await calendar.createBlock(input);
      await expect(
        calendar.createBlock({
          ...input,
          taskId: "task_2",
          slot: iv("2026-09-28T08:00:00.000Z", "2026-09-28T09:00:00.000Z"),
        }),
      ).resolves.toBeDefined();
      await expect(
        calendar.createBlock({ ...input, userId: "user_2", taskId: "task_3" }),
      ).resolves.toBeDefined();
    });

    it("rejects empty or reversed slots", async () => {
      const calendar = createCalendar();
      await expect(
        calendar.createBlock({
          ...input,
          slot: iv("2026-09-28T08:00:00.000Z", "2026-09-28T07:00:00.000Z"),
        }),
      ).rejects.toThrow(InvalidTimeError);
    });

    it("moves a block, allowing overlap with its own previous position", async () => {
      const calendar = createCalendar();
      const booking = await calendar.createBlock(input);
      const moved = iv("2026-09-28T07:30:00.000Z", "2026-09-28T08:30:00.000Z");

      const updated = await calendar.updateBlock(booking.id, moved);

      expect(updated).toMatchObject({ id: booking.id, taskId: "task_1", slot: moved });
      await expect(calendar.getBusyIntervals("user_1", day)).resolves.toEqual([moved]);
    });

    it("rejects moving a block onto another block", async () => {
      const calendar = createCalendar();
      const first = await calendar.createBlock(input);
      await calendar.createBlock({
        ...input,
        taskId: "task_2",
        slot: iv("2026-09-28T09:00:00.000Z", "2026-09-28T10:00:00.000Z"),
      });

      await expect(
        calendar.updateBlock(first.id, iv("2026-09-28T09:30:00.000Z", "2026-09-28T10:30:00.000Z")),
      ).rejects.toThrow(SlotConflictError);
      await expect(calendar.getBusyIntervals("user_1", day)).resolves.toContainEqual(slot);
    });

    it("throws NotFoundError when updating an unknown booking", async () => {
      await expect(createCalendar().updateBlock("booking_missing", slot)).rejects.toThrow(NotFoundError);
    });

    it("deletes a block and frees its slot", async () => {
      const calendar = createCalendar();
      const booking = await calendar.createBlock(input);
      await calendar.deleteBlock(booking.id);

      await expect(calendar.getBusyIntervals("user_1", day)).resolves.toEqual([]);
      await expect(calendar.createBlock({ ...input, taskId: "task_2" })).resolves.toBeDefined();
    });

    it("is NOT idempotent on delete: unknown or already deleted ids throw NotFoundError", async () => {
      const calendar = createCalendar();
      const booking = await calendar.createBlock(input);
      await calendar.deleteBlock(booking.id);

      await expect(calendar.deleteBlock(booking.id)).rejects.toThrow(NotFoundError);
      await expect(calendar.deleteBlock("booking_missing")).rejects.toThrow(NotFoundError);
    });

    it("returns copies: mutating results or inputs never changes stored state", async () => {
      const calendar = createCalendar();
      const mutableInput = { ...input, slot: { ...slot } };
      const booking = await calendar.createBlock(mutableInput);
      mutableInput.slot.start = "2026-09-28T00:00:00.000Z";
      (booking.slot as Mutable<Interval>).start = "2026-09-28T00:00:00.000Z";
      const busy = await calendar.getBusyIntervals("user_1", day);
      (busy[0] as Mutable<Interval>).end = "2026-09-28T23:00:00.000Z";

      await expect(calendar.getBusyIntervals("user_1", day)).resolves.toEqual([slot]);
    });
  });
}

// --- TaskRepository ---------------------------------------------------------

export function describeTaskRepositoryContract(
  name: string,
  createRepository: () => TaskRepository,
): void {
  describe(`${name} satisfies the TaskRepository contract`, () => {
    it("creates and reads back a task; unknown ids give null", async () => {
      const repo = createRepository();
      const task = makeTask();
      await expect(repo.create(task)).resolves.toEqual(task);
      await expect(repo.get(task.id)).resolves.toEqual(task);
      await expect(repo.get("task_missing")).resolves.toBeNull();
    });

    it("rejects a duplicate id with AlreadyExistsError", async () => {
      const repo = createRepository();
      await repo.create(makeTask());
      await expect(repo.create(makeTask({ title: "Другое" }))).rejects.toThrow(AlreadyExistsError);
      await expect(repo.get("task_1")).resolves.toMatchObject({ title: "Подготовить презентацию" });
    });

    it("updates fields and returns the new state", async () => {
      const repo = createRepository();
      await repo.create(makeTask());
      const updated = await repo.update("task_1", {
        status: "scheduled",
        bookingId: "booking_1",
      });
      expect(updated).toMatchObject({ id: "task_1", status: "scheduled", bookingId: "booking_1" });
      await expect(repo.get("task_1")).resolves.toEqual(updated);
    });

    it("throws NotFoundError when updating an unknown task", async () => {
      await expect(createRepository().update("task_missing", { status: "done" })).rejects.toThrow(
        NotFoundError,
      );
    });

    it("lists only the user's tasks ordered by createdAt then id, optionally by status", async () => {
      const repo = createRepository();
      await repo.create(makeTask({ id: "task_3", createdAt: "2026-09-23T10:00:00.000Z" }));
      await repo.create(makeTask({ id: "task_2", createdAt: "2026-09-23T09:00:00.000Z" }));
      await repo.create(
        makeTask({ id: "task_1", createdAt: "2026-09-23T09:00:00.000Z", status: "done" }),
      );
      await repo.create(makeTask({ id: "task_9", userId: "user_2" }));

      const all = await repo.listByUser("user_1");
      expect(all.map((task) => task.id)).toEqual(["task_1", "task_2", "task_3"]);
      const done = await repo.listByUser("user_1", { status: "done" });
      expect(done.map((task) => task.id)).toEqual(["task_1"]);
    });

    it("deletes every task of one user and reports how many", async () => {
      const repo = createRepository();
      await repo.create(makeTask({ id: "task_1" }));
      await repo.create(makeTask({ id: "task_2" }));
      await repo.create(makeTask({ id: "task_3", userId: "user_2" }));

      await expect(repo.deleteAllForUser("user_1")).resolves.toBe(2);
      await expect(repo.listByUser("user_1")).resolves.toEqual([]);
      await expect(repo.get("task_3")).resolves.not.toBeNull();
      await expect(repo.deleteAllForUser("user_1")).resolves.toBe(0);
    });

    it("exports all of the user's tasks, in every status", async () => {
      const repo = createRepository();
      await repo.create(makeTask({ id: "task_1", status: "cancelled" }));
      await repo.create(makeTask({ id: "task_2", status: "done" }));
      await repo.create(makeTask({ id: "task_3", userId: "user_2" }));

      const exported = await repo.exportForUser("user_1");
      expect(exported.map((task) => task.id)).toEqual(["task_1", "task_2"]);
    });

    it("returns copies: mutating results or inputs never changes stored state", async () => {
      const repo = createRepository();
      const input = makeTask({ source: makeSource({ sourceText: "оригинал" }) });
      const created = await repo.create(input);
      (input.source as Mutable<Task["source"]>).sourceText = "изменено входом";
      (created.source as Mutable<Task["source"]>).sourceText = "изменено результатом";
      const fetched = await repo.get("task_1");
      (fetched as Mutable<Task>).title = "изменено чтением";
      const listed = await repo.listByUser("user_1");
      (listed[0] as Mutable<Task>).status = "done";
      const exported = await repo.exportForUser("user_1");
      exported.length = 0;

      const stored = await repo.get("task_1");
      expect(stored?.source.sourceText).toBe("оригинал");
      expect(stored?.title).toBe("Подготовить презентацию");
      expect(stored?.status).toBe("inbox");
    });
  });
}

// --- ReminderQueue ----------------------------------------------------------

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

export function describeReminderQueueContract(
  name: string,
  createQueue: () => ReminderQueue,
): void {
  describe(`${name} satisfies the ReminderQueue contract`, () => {
    const due = "2026-09-24T07:00:00.000Z";
    const afterDue = "2026-09-24T07:00:01.000Z";

    it("schedules a pending reminder with zero attempts", async () => {
      const queue = createQueue();
      await expect(queue.schedule(newReminder())).resolves.toEqual(makeReminder());
    });

    it("rejects a duplicate id with AlreadyExistsError", async () => {
      const queue = createQueue();
      await queue.schedule(newReminder());
      await expect(queue.schedule(newReminder())).rejects.toThrow(AlreadyExistsError);
    });

    it("claims only pending reminders that are due, ordered by dueAt then id, up to limit", async () => {
      const queue = createQueue();
      await queue.schedule(newReminder({ id: "reminder_b", dueAt: "2026-09-24T07:00:00.000Z" }));
      await queue.schedule(newReminder({ id: "reminder_a", dueAt: "2026-09-24T07:00:00.000Z" }));
      await queue.schedule(newReminder({ id: "reminder_c", dueAt: "2026-09-24T06:00:00.000Z" }));
      await queue.schedule(newReminder({ id: "reminder_d", dueAt: "2026-09-24T08:00:00.000Z" }));

      const claimed = await queue.claimDue("2026-09-24T07:30:00.000Z", 10);
      expect(claimed.map((reminder) => reminder.id)).toEqual(["reminder_c", "reminder_a", "reminder_b"]);
      const limited = await queue.claimDue("2026-09-24T07:30:00.000Z", 2);
      expect(limited.map((reminder) => reminder.id)).toEqual(["reminder_c", "reminder_a"]);
    });

    it("treats dueAt == now as due and does not claim earlier than dueAt", async () => {
      const queue = createQueue();
      await queue.schedule(newReminder());
      await expect(queue.claimDue("2026-09-24T06:59:59.999Z", 10)).resolves.toEqual([]);
      await expect(queue.claimDue(due, 10)).resolves.toHaveLength(1);
    });

    it("does not mark anything on claim: the same reminder is claimable again", async () => {
      const queue = createQueue();
      await queue.schedule(newReminder());
      const first = await queue.claimDue(afterDue, 10);
      const second = await queue.claimDue(afterDue, 10);
      expect(second).toEqual(first);
      expect(second[0]?.status).toBe("pending");
    });

    it("rejects a non-positive or non-integer limit", async () => {
      const queue = createQueue();
      await expect(queue.claimDue(afterDue, 0)).rejects.toThrow(RangeError);
      await expect(queue.claimDue(afterDue, 1.5)).rejects.toThrow(RangeError);
    });

    it("marks a reminder sent and stops claiming it", async () => {
      const queue = createQueue();
      await queue.schedule(newReminder());
      await expect(queue.markSent("reminder_1")).resolves.toMatchObject({ status: "sent" });
      await expect(queue.claimDue(afterDue, 10)).resolves.toEqual([]);
    });

    it("throws NotFoundError for unknown ids and ReminderStateError for non-pending ones", async () => {
      const queue = createQueue();
      await expect(queue.markSent("reminder_missing")).rejects.toThrow(NotFoundError);
      await expect(queue.markFailed("reminder_missing", "boom")).rejects.toThrow(NotFoundError);

      await queue.schedule(newReminder());
      await queue.markSent("reminder_1");
      await expect(queue.markSent("reminder_1")).rejects.toThrow(ReminderStateError);
      await expect(queue.markFailed("reminder_1", "boom")).rejects.toThrow(ReminderStateError);
    });

    it(`retries a failing reminder until ${MAX_REMINDER_ATTEMPTS} attempts, then fails it for good`, async () => {
      const queue = createQueue();
      await queue.schedule(newReminder());

      for (let attempt = 1; attempt < MAX_REMINDER_ATTEMPTS; attempt += 1) {
        const result = await queue.markFailed("reminder_1", `error ${attempt}`);
        expect(result).toMatchObject({ status: "pending", attempts: attempt, lastError: `error ${attempt}` });
        await expect(queue.claimDue(afterDue, 10)).resolves.toHaveLength(1);
      }

      const last = await queue.markFailed("reminder_1", "final error");
      expect(last).toMatchObject({
        status: "failed",
        attempts: MAX_REMINDER_ATTEMPTS,
        lastError: "final error",
      });
      await expect(queue.claimDue(afterDue, 10)).resolves.toEqual([]);
      await expect(queue.markFailed("reminder_1", "again")).rejects.toThrow(ReminderStateError);
    });

    it("cancels only the given user's pending reminders", async () => {
      const queue = createQueue();
      await queue.schedule(newReminder({ id: "reminder_1" }));
      await queue.schedule(newReminder({ id: "reminder_2" }));
      await queue.schedule(newReminder({ id: "reminder_3" }));
      await queue.schedule(newReminder({ id: "reminder_4", userId: "user_2" }));
      await queue.markSent("reminder_3");

      await expect(queue.cancelForUser("user_1")).resolves.toBe(2);
      const claimed = await queue.claimDue(afterDue, 10);
      expect(claimed.map((reminder) => reminder.id)).toEqual(["reminder_4"]);
      await expect(queue.cancelForUser("user_1")).resolves.toBe(0);
      await expect(queue.markSent("reminder_1")).rejects.toThrow(ReminderStateError);
    });

    it("returns copies: mutating results or inputs never changes stored state", async () => {
      const queue = createQueue();
      const input = newReminder();
      const scheduled = await queue.schedule(input);
      (input as Mutable<NewReminder>).dueAt = "2030-01-01T00:00:00.000Z";
      (scheduled as Mutable<typeof scheduled>).status = "sent";
      const claimed = await queue.claimDue(afterDue, 10);
      (claimed[0] as Mutable<(typeof claimed)[number]>).status = "cancelled";

      await expect(queue.claimDue(afterDue, 10)).resolves.toEqual([makeReminder()]);
    });
  });
}
