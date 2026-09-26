import { describe, expect, it } from "vitest";
import { MemoryNotConfirmedError } from "../domain";
import type { MemoryRecord } from "../domain";
import type { ActualDurationRecord } from "../testing/domainFixtures";
import { makeActualDurationRecord, makeRescheduleCountRecord } from "../testing/domainFixtures";
import { createInMemoryMemoryRepository } from "./inMemoryMemoryRepository";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

describe("inMemoryMemoryRepository", () => {
  it("lists records per user in insertion order", async () => {
    const repo = createInMemoryMemoryRepository();
    await repo.record("user_1", makeActualDurationRecord({ id: "memory_2" }));
    await repo.record("user_1", makeRescheduleCountRecord({ id: "memory_1" }));
    await repo.record("user_2", makeActualDurationRecord({ id: "memory_3" }));

    const listed = await repo.listByUser("user_1");
    expect(listed.map((item) => item.id)).toEqual(["memory_2", "memory_1"]);
    await expect(repo.listByUser("user_3")).resolves.toEqual([]);
  });

  it("stores every memory kind in the plan's Task 11 field list (working_hours ... notification_response)", async () => {
    const repo = createInMemoryMemoryRepository();
    const base = { recordedAt: "2026-09-24T10:00:00.000Z", confirmedByUser: true };
    const records: MemoryRecord[] = [
      { ...base, id: "m1", kind: "working_hours", workingHours: { isoDays: [1], start: "09:00", end: "18:00" } },
      { ...base, id: "m2", kind: "preferred_block_length", minutes: 60 },
      { ...base, id: "m3", kind: "task_duration_estimate", taskId: "task_1", minutes: 90 },
      { ...base, id: "m4", kind: "actual_duration", taskId: "task_1", minutes: 120 },
      { ...base, id: "m5", kind: "reschedule_count", taskId: "task_1", count: 2 },
      { ...base, id: "m6", kind: "failure_reason", taskId: "task_1", reason: "task_too_big" },
      { ...base, id: "m7", kind: "notification_response", reminderId: "reminder_1", response: "needs_time" },
    ];
    for (const item of records) await repo.record("user_1", item);
    await expect(repo.listByUser("user_1")).resolves.toEqual(records);
  });

  it("refuses records the user has not confirmed", async () => {
    const repo = createInMemoryMemoryRepository();
    await expect(repo.record("user_1", makeActualDurationRecord({ confirmedByUser: false }))).rejects.toThrow(
      MemoryNotConfirmedError,
    );
    await expect(repo.listByUser("user_1")).resolves.toEqual([]);
  });

  it("deletes all records of one user and reports the count", async () => {
    const repo = createInMemoryMemoryRepository();
    await repo.record("user_1", makeActualDurationRecord({ id: "memory_1" }));
    await repo.record("user_1", makeActualDurationRecord({ id: "memory_2" }));
    await repo.record("user_2", makeActualDurationRecord({ id: "memory_3" }));

    await expect(repo.deleteAllForUser("user_1")).resolves.toBe(2);
    await expect(repo.listByUser("user_1")).resolves.toEqual([]);
    await expect(repo.listByUser("user_2")).resolves.toHaveLength(1);
    await expect(repo.deleteAllForUser("user_1")).resolves.toBe(0);
  });

  it("returns copies: mutating results or inputs never changes stored state", async () => {
    const repo = createInMemoryMemoryRepository();
    const input = makeActualDurationRecord();
    await repo.record("user_1", input);
    (input as Mutable<typeof input>).minutes = 1;
    const listed = await repo.listByUser("user_1");
    (listed[0] as Mutable<ActualDurationRecord>).minutes = 2;
    listed.length = 0;

    await expect(repo.listByUser("user_1")).resolves.toEqual([makeActualDurationRecord()]);
  });
});
