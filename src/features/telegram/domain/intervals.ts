import { InvalidTimeError } from "./errors";
import { parseInstant } from "./time";
import type { Interval } from "./types";

/** Throws `InvalidTimeError` unless both ends are valid instants with start < end. */
export function assertValidInterval(interval: Interval): void {
  if (parseInstant(interval.start) >= parseInstant(interval.end)) {
    throw new InvalidTimeError("Interval start must be before its end");
  }
}

/**
 * Intervals are half-open `[start, end)`: two intervals that merely touch (one
 * ends exactly when the other starts) do not overlap.
 */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return parseInstant(a.start) < parseInstant(b.end) && parseInstant(b.start) < parseInstant(a.end);
}
