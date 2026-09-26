import { describe, expect, it } from "vitest";
import {
  CHECK_IN_OUTCOMES,
  CHECK_IN_REASONS,
  DEFAULT_SEARCH_HORIZON_DAYS,
  MAX_SEARCH_HORIZON_DAYS,
  followUpForReason,
  MAX_REMINDER_ATTEMPTS,
} from "./types";
import type { CheckIn } from "./types";

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

  it("covers every declared reason", () => {
    for (const reason of CHECK_IN_REASONS) {
      expect(["reschedule", "split", "reprioritize"]).toContain(followUpForReason(reason));
    }
  });
});

describe("reminder policy", () => {
  it("allows five delivery attempts", () => {
    expect(MAX_REMINDER_ATTEMPTS).toBe(5);
  });
});

describe("CheckIn", () => {
  it("models an open check-in and an answered one", () => {
    const open: CheckIn = {
      id: "checkin_1",
      taskId: "task_1",
      userId: "user_1",
      bookingId: "booking_1",
      askedAt: "2026-09-24T09:00:00.000Z",
      outcome: null,
      reason: null,
      answeredAt: null,
    };
    const answered: CheckIn = {
      ...open,
      outcome: "needs_time",
      reason: "not_enough_time",
      answeredAt: "2026-09-24T09:05:00.000Z",
    };
    expect(CHECK_IN_OUTCOMES).toContain(answered.outcome);
    expect(CHECK_IN_REASONS).toContain(answered.reason);
    expect(open.outcome).toBeNull();
  });
});

describe("search horizon", () => {
  it("searches a week without a deadline and never more than 60 days", () => {
    expect(DEFAULT_SEARCH_HORIZON_DAYS).toBe(7);
    expect(MAX_SEARCH_HORIZON_DAYS).toBe(60);
  });
});
