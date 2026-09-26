import { describe, expect, it } from "vitest";
import { InvalidIntentError, InvalidSettingsError, InvalidTimeError } from "../domain/errors";
import type { Interval, Task } from "../domain/types";
import { makeSettings } from "../testing/domainFixtures";
import { describeSlotSchedulerContract } from "./ports.contract";
import { createSlotScheduler } from "./slotScheduler";

describeSlotSchedulerContract("slotScheduler", createSlotScheduler);

// Monday 2026-09-28 09:10 in Moscow (UTC+3, no DST). Working hours 09:00-18:00 Mon-Fri.
const MONDAY_0910 = "2026-09-28T06:10:00.000Z";

type Input = Parameters<ReturnType<typeof createSlotScheduler>["propose"]>[0];
type Overrides = Partial<Omit<Input, "task">> & { task?: Partial<Input["task"]> };

function propose(overrides: Overrides = {}) {
  const { task, ...rest } = overrides;
  return createSlotScheduler().propose({
    task: { id: "task_1", deadline: null, durationMinutes: 60, priority: "normal", ...task },
    busy: [],
    settings: makeSettings(),
    now: MONDAY_0910,
    ...rest,
  });
}

const starts = (slots: readonly Interval[]) => slots.map((slot) => slot.start);
const iv = (start: string, end: string): Interval => ({ start, end });

describe("slotScheduler", () => {
  describe("candidate grid", () => {
    it("rounds now up to the next 30-minute grid point", () => {
      expect(propose()[0]).toEqual(iv("2026-09-28T06:30:00.000Z", "2026-09-28T07:30:00.000Z"));
    });

    it("keeps now when it is already on the grid", () => {
      const slots = propose({ now: "2026-09-28T06:30:00.000Z" });
      expect(slots[0]?.start).toBe("2026-09-28T06:30:00.000Z");
    });

    it("rounds up sub-minute remainders", () => {
      const slots = propose({ now: "2026-09-28T06:30:00.001Z" });
      expect(slots[0]?.start).toBe("2026-09-28T07:00:00.000Z");
    });

    it("aligns to the local wall-clock grid in a +05:45 timezone", () => {
      const slots = propose({
        settings: makeSettings({ timezone: "Asia/Kathmandu" }),
        now: "2026-09-28T02:00:00.000Z", // 07:45 local
      });
      // First local grid point in working hours is 09:00 = 03:15Z.
      expect(slots[0]?.start).toBe("2026-09-28T03:15:00.000Z");
    });

    it("starts at the beginning of working hours when now is earlier", () => {
      const slots = propose({ now: "2026-09-28T02:00:00.000Z" }); // 05:00 local
      expect(slots[0]?.start).toBe("2026-09-28T06:00:00.000Z"); // 09:00 local
    });
  });

  describe("busy intervals", () => {
    it("skips over a busy interval", () => {
      const slots = propose({
        busy: [iv("2026-09-28T06:00:00.000Z", "2026-09-28T08:00:00.000Z")],
      });
      expect(slots[0]?.start).toBe("2026-09-28T08:00:00.000Z"); // 11:00 local
    });

    it("allows a slot that ends exactly when a busy interval starts", () => {
      const slots = propose({
        busy: [iv("2026-09-28T07:30:00.000Z", "2026-09-28T09:00:00.000Z")],
      });
      expect(slots[0]).toEqual(iv("2026-09-28T06:30:00.000Z", "2026-09-28T07:30:00.000Z"));
    });

    it("rejects a slot that overlaps the busy interval by a single grid step", () => {
      const slots = propose({
        busy: [iv("2026-09-28T07:00:00.000Z", "2026-09-28T09:00:00.000Z")],
      });
      expect(slots[0]?.start).toBe("2026-09-28T09:00:00.000Z");
    });

    it("does not depend on the order of the busy list", () => {
      const busy = [
        iv("2026-09-28T09:00:00.000Z", "2026-09-28T10:00:00.000Z"),
        iv("2026-09-28T06:00:00.000Z", "2026-09-28T08:00:00.000Z"),
        iv("2026-09-29T06:00:00.000Z", "2026-09-29T09:00:00.000Z"),
      ];
      expect(propose({ busy })).toEqual(propose({ busy: [...busy].reverse() }));
    });

    it("rejects malformed busy intervals", () => {
      expect(() =>
        propose({ busy: [iv("2026-09-28T08:00:00.000Z", "2026-09-28T06:00:00.000Z")] }),
      ).toThrow(InvalidTimeError);
    });
  });

  describe("working hours", () => {
    it("moves to the next day when the block does not fit in the rest of today", () => {
      const slots = propose({
        task: { durationMinutes: 120 },
        now: "2026-09-28T13:10:00.000Z", // 16:10 local; 16:30 + 2h would end 18:30
      });
      expect(slots[0]?.start).toBe("2026-09-29T06:00:00.000Z"); // Tuesday 09:00 local
    });

    it("allows a block that ends exactly at the end of working hours", () => {
      const slots = propose({
        task: { durationMinutes: 60, priority: "high" },
        now: "2026-09-28T13:00:00.000Z", // 16:00 local
      });
      expect(slots.some((slot) => slot.end === "2026-09-28T15:00:00.000Z")).toBe(true);
    });

    it("never proposes a block longer than a working window", () => {
      expect(propose({ task: { durationMinutes: 10 * 60 } })).toEqual([]);
    });

    it("uses custom working days and hours", () => {
      const slots = propose({
        settings: makeSettings({ workingHours: { isoDays: [3], start: "14:00", end: "16:00" } }),
        task: { durationMinutes: 30 },
      });
      expect(slots[0]?.start).toBe("2026-09-30T11:00:00.000Z"); // Wednesday 14:00 local
    });

    it("does not carry a slot across the weekend", () => {
      const slots = propose({ now: "2026-10-02T14:10:00.000Z" }); // Friday 17:10 local
      expect(slots[0]?.start).toBe("2026-10-05T06:00:00.000Z"); // Monday 09:00 local
    });

    it("returns nothing when there are no working days", () => {
      expect(propose({ settings: makeSettings({ workingHours: { isoDays: [], start: "09:00", end: "18:00" } }) })).toEqual([]);
    });
  });

  describe("weekend skipping", () => {
    it("proposes weekdays only", () => {
      const slots = propose({ now: "2026-10-02T06:10:00.000Z", task: { durationMinutes: 120 } });
      for (const slot of slots) {
        const day = new Date(slot.start).getUTCDay();
        expect([0, 6]).not.toContain(day);
      }
    });
  });

  describe("deadline", () => {
    it("keeps every slot inside the deadline", () => {
      const slots = propose({ task: { deadline: "2026-09-28T09:00:00.000Z" } }); // 12:00 local
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        expect(slot.end <= "2026-09-28T09:00:00.000Z").toBe(true);
      }
      expect(starts(slots)).toContain("2026-09-28T06:30:00.000Z");
    });

    it("includes a slot that ends exactly at the deadline", () => {
      const slots = propose({ task: { deadline: "2026-09-28T07:30:00.000Z" } });
      expect(slots).toEqual([iv("2026-09-28T06:30:00.000Z", "2026-09-28T07:30:00.000Z")]);
    });

    it("returns nothing when the deadline has passed", () => {
      expect(propose({ task: { deadline: "2026-09-28T06:00:00.000Z" } })).toEqual([]);
      expect(propose({ task: { deadline: MONDAY_0910 } })).toEqual([]);
    });

    it("returns nothing when the block cannot fit before the deadline", () => {
      expect(propose({ task: { deadline: "2026-09-28T07:00:00.000Z" } })).toEqual([]);
    });

    it("searches only 7 days ahead when there is no deadline", () => {
      const slots = propose({
        busy: [iv("2026-09-28T00:00:00.000Z", "2026-10-05T06:10:00.000Z")], // busy for 7 days
      });
      expect(slots).toEqual([]);
    });

    it("caps the search for a far deadline instead of scanning years", () => {
      const slots = propose({ task: { deadline: "2099-01-01T00:00:00.000Z" } });
      expect(slots.length).toBeGreaterThan(0);
      const last = slots[slots.length - 1];
      expect(new Date(last?.start ?? "").getTime()).toBeLessThan(Date.parse(MONDAY_0910) + 61 * 86_400_000);
    });
  });

  describe("selection", () => {
    it("proposes the earliest slot first, then different days and times of day", () => {
      expect(propose()).toEqual([
        iv("2026-09-28T06:30:00.000Z", "2026-09-28T07:30:00.000Z"), // Mon 09:30 (morning)
        iv("2026-09-29T09:00:00.000Z", "2026-09-29T10:00:00.000Z"), // Tue 12:00 (afternoon)
        iv("2026-09-30T14:00:00.000Z", "2026-09-30T15:00:00.000Z"), // Wed 17:00 (evening)
      ]);
    });

    it("returns fewer than three slots when that is all there is", () => {
      const slots = propose({ task: { deadline: "2026-09-28T08:00:00.000Z" } }); // 11:00 local
      expect(slots).toEqual([
        iv("2026-09-28T06:30:00.000Z", "2026-09-28T07:30:00.000Z"),
        iv("2026-09-28T07:00:00.000Z", "2026-09-28T08:00:00.000Z"),
      ]);
    });

    it("falls back to overlapping alternatives on one day, earliest first", () => {
      const slots = propose({ task: { deadline: "2026-09-28T09:00:00.000Z" } }); // 12:00 local
      expect(starts(slots)).toEqual([
        "2026-09-28T06:30:00.000Z",
        "2026-09-28T07:00:00.000Z",
        "2026-09-28T07:30:00.000Z",
      ]);
    });

    it("prefers non-overlapping alternatives, then a different time of day", () => {
      const slots = propose({
        task: { deadline: "2026-09-28T10:00:00.000Z" }, // 13:00 local
      });
      expect(starts(slots)).toEqual([
        "2026-09-28T06:30:00.000Z", // 09:30-10:30, earliest
        "2026-09-28T07:30:00.000Z", // 10:30-11:30, then the earliest remaining that does not overlap
        "2026-09-28T09:00:00.000Z", // 12:00-13:00, the only afternoon slot
      ]);
    });

    it("high priority proposes the earliest slots without spreading them out", () => {
      const slots = propose({ task: { priority: "high" } });
      expect(starts(slots)).toEqual([
        "2026-09-28T06:30:00.000Z", // 09:30
        "2026-09-28T07:30:00.000Z", // 10:30
        "2026-09-28T08:30:00.000Z", // 11:30
      ]);
    });

    it("low priority may skip the first day", () => {
      const slots = propose({ task: { priority: "low" } });
      expect(starts(slots)).toEqual([
        "2026-09-29T06:00:00.000Z", // Tue 09:00
        "2026-09-30T09:00:00.000Z", // Wed 12:00
        "2026-10-01T14:00:00.000Z", // Thu 17:00
      ]);
    });

    it("low priority still uses the first day when it is the only one available", () => {
      const slots = propose({ task: { priority: "low", deadline: "2026-09-28T09:00:00.000Z" } });
      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0]?.start).toBe("2026-09-28T06:30:00.000Z");
    });

    it("counts the first day with free time as the first day", () => {
      // Monday is fully busy, so Tuesday is the first day and is skipped by low priority.
      const slots = propose({
        task: { priority: "low" },
        busy: [iv("2026-09-28T00:00:00.000Z", "2026-09-29T00:00:00.000Z")],
      });
      expect(slots[0]?.start).toBe("2026-09-30T06:00:00.000Z");
    });
  });

  describe("block length", () => {
    it("uses the task duration when present", () => {
      const [slot] = propose({ task: { durationMinutes: 90 } });
      expect(slot).toEqual(iv("2026-09-28T06:30:00.000Z", "2026-09-28T08:00:00.000Z"));
    });

    it("falls back to settings.defaultBlockMinutes only when the task has no duration", () => {
      const [slot] = propose({
        task: { durationMinutes: null },
        settings: makeSettings({ defaultBlockMinutes: 45 }),
      });
      expect(slot).toEqual(iv("2026-09-28T06:30:00.000Z", "2026-09-28T07:15:00.000Z"));
    });

    it.each([0, -30, 1.5])("rejects task duration %s", (durationMinutes) => {
      expect(() => propose({ task: { durationMinutes } })).toThrow(InvalidIntentError);
    });
  });

  describe("daylight saving time", () => {
    const newYork = (start: string, end: string) =>
      makeSettings({
        timezone: "America/New_York",
        workingHours: { isoDays: [1, 2, 3, 4, 5, 6, 7], start, end },
      });

    it("spring-forward day: the 01:00-04:00 window is only two real hours", () => {
      // 2026-03-08 in New York: 02:00 EST jumps to 03:00 EDT.
      const base = { now: "2026-03-08T05:00:00.000Z", settings: newYork("01:00", "04:00") };
      expect(propose({ ...base, task: { deadline: "2026-03-08T12:00:00.000Z" } })).toEqual([
        iv("2026-03-08T06:00:00.000Z", "2026-03-08T07:00:00.000Z"),
        iv("2026-03-08T06:30:00.000Z", "2026-03-08T07:30:00.000Z"),
        iv("2026-03-08T07:00:00.000Z", "2026-03-08T08:00:00.000Z"),
      ]);
      expect(propose({ ...base, task: { durationMinutes: 120, deadline: "2026-03-08T12:00:00.000Z" } })).toEqual([
        iv("2026-03-08T06:00:00.000Z", "2026-03-08T08:00:00.000Z"),
      ]);
      expect(propose({ ...base, task: { durationMinutes: 150, deadline: "2026-03-08T12:00:00.000Z" } })).toEqual([]);
    });

    it("fall-back day: the 01:00-03:00 window is three real hours", () => {
      // 2026-11-01 in New York: 02:00 EDT falls back to 01:00 EST.
      const slots = propose({
        now: "2026-11-01T03:00:00.000Z",
        settings: newYork("01:00", "03:00"),
        task: { durationMinutes: 180 },
      });
      expect(slots).toEqual([iv("2026-11-01T05:00:00.000Z", "2026-11-01T08:00:00.000Z")]);
    });

    it("keeps wall-clock working hours across the change (09:00 local before and after)", () => {
      const settings = makeSettings({ timezone: "Europe/Berlin" });
      // Fri 2026-03-27 is CET (UTC+1); Mon 2026-03-30 is CEST (UTC+2).
      const friday = propose({ settings, now: "2026-03-27T17:30:00.000Z", task: { durationMinutes: 30 } });
      expect(friday[0]?.start).toBe("2026-03-30T07:00:00.000Z"); // Monday 09:00 CEST
    });
  });

  describe("purity", () => {
    it("returns identical output for identical input and does not mutate its input", () => {
      const settings = Object.freeze(
        makeSettings({ workingHours: Object.freeze({ isoDays: Object.freeze([1, 2, 3, 4, 5]), start: "09:00", end: "18:00" }) }),
      );
      const task = Object.freeze({ id: "task_1", deadline: null, durationMinutes: 60, priority: "normal" }) as Pick<Task, "id" | "deadline" | "durationMinutes" | "priority">;
      const busy = Object.freeze([Object.freeze(iv("2026-09-28T07:00:00.000Z", "2026-09-28T08:00:00.000Z"))]);
      const input = { task, busy, settings, now: MONDAY_0910 };

      const first = createSlotScheduler().propose(input);
      const second = createSlotScheduler().propose(input);
      expect(first).toEqual(second);
    });

    it("returns fresh arrays and objects on every call", () => {
      const scheduler = createSlotScheduler();
      const input = {
        task: { id: "task_1", deadline: null, durationMinutes: 60, priority: "normal" as const },
        busy: [],
        settings: makeSettings(),
        now: MONDAY_0910,
      };
      const a = scheduler.propose(input);
      const b = scheduler.propose(input);
      expect(a).not.toBe(b);
      expect(a[0]).not.toBe(b[0]);
    });
  });

  describe("input validation", () => {
    it("rejects invalid settings", () => {
      expect(() => propose({ settings: makeSettings({ defaultBlockMinutes: 0 }) })).toThrow(InvalidSettingsError);
    });

    it("rejects a malformed now or deadline", () => {
      expect(() => propose({ now: "today" })).toThrow(InvalidTimeError);
      expect(() => propose({ task: { deadline: "friday" } })).toThrow(InvalidTimeError);
    });
  });
});
