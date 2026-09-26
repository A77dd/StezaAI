import { describe, expect, it } from "vitest";
import {
  CHECK_IN_REASONS,
  followUpForReason,
  MAX_REMINDER_ATTEMPTS,
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
