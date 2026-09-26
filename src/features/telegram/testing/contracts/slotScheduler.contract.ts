import { describe, expect, it } from "vitest";
import { intervalsOverlap, parseClockTime, parseInstant, toZonedParts } from "../../domain";
import type { Interval, SlotScheduler, Task, UserSettings } from "../../domain";
import { makeSettings } from "../domainFixtures";
import { useSubject } from "./harness";
import type { ContractFactory } from "./harness";

const iv = (start: string, end: string): Interval => ({ start, end });

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
  factory: ContractFactory<SlotScheduler>,
): void {
  describe(`${name} satisfies the SlotScheduler contract`, () => {
    const scheduler = useSubject(factory);

    describe.each(schedulerScenarios)("$name", (scenario) => {
      const proposeResult = () =>
        scheduler().propose({
          task: scenario.task,
          busy: scenario.busy,
          settings: scenario.settings,
          now: scenario.now,
        });
      const propose = () => proposeResult().slots;

      it("reports why it stopped: found, with a searchedUntil after now", () => {
        const result = proposeResult();
        expect(result.exhausted).toBe("found");
        expect(parseInstant(result.searchedUntil)).toBeGreaterThan(parseInstant(scenario.now));
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

    it("returns no slots and horizon_reached when the default 7-day horizon is full", () => {
      const result = scheduler().propose({
        task: { id: "task_1", deadline: null, durationMinutes: 60, priority: "normal" },
        busy: [iv("2026-09-28T00:00:00.000Z", "2026-10-30T00:00:00.000Z")],
        settings: makeSettings(),
        now: MONDAY_MORNING,
      });
      expect(result).toEqual({
        slots: [],
        searchedUntil: "2026-10-05T06:10:00.000Z", // now + DEFAULT_SEARCH_HORIZON_DAYS
        exhausted: "horizon_reached",
      });
    });

    it("returns none_before_deadline when the deadline is reached without a free slot", () => {
      const result = scheduler().propose({
        task: {
          id: "task_1",
          deadline: "2026-09-30T20:59:00.000Z",
          durationMinutes: 60,
          priority: "normal",
        },
        busy: [iv("2026-09-28T00:00:00.000Z", "2026-10-30T00:00:00.000Z")],
        settings: makeSettings(),
        now: MONDAY_MORNING,
      });
      expect(result).toEqual({
        slots: [],
        searchedUntil: "2026-09-30T20:59:00.000Z",
        exhausted: "none_before_deadline",
      });
    });

    it("caps a distant deadline at the maximum horizon and reports horizon_reached", () => {
      const result = scheduler().propose({
        task: {
          id: "task_1",
          deadline: "2027-06-01T00:00:00.000Z",
          durationMinutes: 60,
          priority: "normal",
        },
        busy: [iv("2026-09-28T00:00:00.000Z", "2027-01-01T00:00:00.000Z")],
        settings: makeSettings(),
        now: MONDAY_MORNING,
      });
      expect(result.slots).toEqual([]);
      expect(result.exhausted).toBe("horizon_reached");
      expect(result.searchedUntil).toBe("2026-11-27T06:10:00.000Z"); // now + MAX_SEARCH_HORIZON_DAYS
    });
  });
}

