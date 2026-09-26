import { describe, expect, expectTypeOf, it } from "vitest";
import { followUpForReason } from "./types";
import type {
  BookingId,
  CheckIn,
  CheckInOutcome,
  CheckInReason,
  Instant,
  MemoryRecord,
  Reminder,
  SlotSearchResult,
  TaskId,
  UserId,
} from "./types";

describe("followUpForReason", () => {
  it.each([
    ["not_enough_time", "reschedule"],
    ["task_too_big", "split"],
    ["unclear_start", "split"],
    ["more_important", "reprioritize"],
    ["postponed", "reschedule"],
  ] as const)("%s -> %s", (reason, followUp) => {
    expect(followUpForReason(reason)).toBe(followUp);
  });
});

describe("domain types (compile-time checks)", () => {
  it("CheckIn is open until answered: outcome, reason and answeredAt are nullable together", () => {
    expectTypeOf<CheckIn["id"]>().toEqualTypeOf<string>();
    expectTypeOf<CheckIn["taskId"]>().toEqualTypeOf<TaskId>();
    expectTypeOf<CheckIn["userId"]>().toEqualTypeOf<UserId>();
    expectTypeOf<CheckIn["bookingId"]>().toEqualTypeOf<BookingId>();
    expectTypeOf<CheckIn["askedAt"]>().toEqualTypeOf<Instant>();
    expectTypeOf<CheckIn["outcome"]>().toEqualTypeOf<CheckInOutcome | null>();
    expectTypeOf<CheckIn["reason"]>().toEqualTypeOf<CheckInReason | null>();
    expectTypeOf<CheckIn["answeredAt"]>().toEqualTypeOf<Instant | null>();
  });

  it("unconfirmed memory records cannot be constructed", () => {
    expectTypeOf<MemoryRecord["confirmedByUser"]>().toEqualTypeOf<true>();
    const unconfirmed: MemoryRecord = {
      id: "memory_1",
      recordedAt: "2026-09-24T10:00:00.000Z",
      // @ts-expect-error confirmedByUser must be the literal true
      confirmedByUser: false,
      kind: "preferred_block_length",
      minutes: 60,
    };
    expect(unconfirmed.kind).toBe("preferred_block_length");
  });

  it("a reminder carries its lease and retry state", () => {
    expectTypeOf<Reminder["leasedUntil"]>().toEqualTypeOf<Instant | null>();
    expectTypeOf<Reminder["nextAttemptAt"]>().toEqualTypeOf<Instant | null>();
    expectTypeOf<Reminder["lastError"]>().toEqualTypeOf<string | null>();
  });

  it("search results expose slots as read-only", () => {
    expectTypeOf<SlotSearchResult["slots"]>().toEqualTypeOf<
      readonly { readonly start: Instant; readonly end: Instant }[]
    >();
  });
});
