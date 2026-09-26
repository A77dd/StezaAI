import { describe, expect, it } from "vitest";
import * as domain from "./index";

describe("domain public barrel", () => {
  it.each([
    // types.ts
    "followUpForReason",
    "MAX_REMINDER_ATTEMPTS",
    "DEFAULT_SEARCH_HORIZON_DAYS",
    "MAX_SEARCH_HORIZON_DAYS",
    "INTENT_KINDS",
    "CHECK_IN_REASONS",
    // errors.ts
    "TelegramLayerError",
    "SlotConflictError",
    "NotFoundError",
    "TranscriptionUnavailableError",
    "InvalidTimezoneError",
    "InvalidIntentError",
    // time.ts
    "parseInstant",
    "formatInstant",
    "toZonedParts",
    "fromZoned",
    "addMinutes",
    "startOfDayInZone",
    "assertValidTimezone",
    "parseClockTime",
    // settings.ts and intervals.ts
    "createDefaultSettings",
    "assertValidSettings",
    "assertValidInterval",
    "intervalsOverlap",
  ])("exports %s", (name) => {
    expect(name in domain).toBe(true);
  });
});
