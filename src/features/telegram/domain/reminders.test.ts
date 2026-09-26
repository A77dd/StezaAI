import { describe, expect, it } from "vitest";
import { InvalidArgumentError } from "./errors";
import {
  MAX_REMINDER_ERROR_LENGTH,
  REMINDER_RETRY_BACKOFF_SECONDS,
  retryDelayMs,
  sanitizeDeliveryError,
} from "./reminders";
import { MAX_REMINDER_ATTEMPTS } from "./types";

describe("reminder retry backoff", () => {
  it("is exponential: 30 s, 2 min, 10 min, 1 h", () => {
    expect([...REMINDER_RETRY_BACKOFF_SECONDS]).toEqual([30, 120, 600, 3600]);
  });

  it("has one delay per failure that is followed by another attempt", () => {
    expect(REMINDER_RETRY_BACKOFF_SECONDS).toHaveLength(MAX_REMINDER_ATTEMPTS - 1);
  });

  it.each([
    [1, 30_000],
    [2, 120_000],
    [3, 600_000],
    [4, 3_600_000],
  ])("waits %s -> %s ms after that many failures", (failures, delay) => {
    expect(retryDelayMs(failures)).toBe(delay);
  });

  it.each([0, -1, 5, 6, 1.5, Number.NaN])("has no delay for %s failures", (failures) => {
    expect(() => retryDelayMs(failures)).toThrow(InvalidArgumentError);
  });
});

describe("sanitizeDeliveryError", () => {
  it("collapses newlines, tabs and runs of spaces", () => {
    expect(sanitizeDeliveryError("Forbidden:\n\tbot was blocked   by the user\r\n")).toBe(
      "Forbidden: bot was blocked by the user",
    );
  });

  it("caps the length at 200 characters, ending with an ellipsis", () => {
    const sanitized = sanitizeDeliveryError("x".repeat(500));
    expect(Array.from(sanitized)).toHaveLength(MAX_REMINDER_ERROR_LENGTH);
    expect(sanitized.endsWith("…")).toBe(true);
  });

  it("keeps text at the limit unchanged and never splits a surrogate pair", () => {
    expect(sanitizeDeliveryError("y".repeat(200))).toBe("y".repeat(200));
    const emoji = sanitizeDeliveryError("😀".repeat(300));
    expect(Array.from(emoji)).toHaveLength(MAX_REMINDER_ERROR_LENGTH);
    expect(emoji).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("never returns an empty string for an empty error", () => {
    expect(sanitizeDeliveryError("  \n ")).toBe("unknown error");
  });
});
