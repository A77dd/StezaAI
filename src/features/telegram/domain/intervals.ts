import { InvalidTimeError } from "./errors";
import { parseInstant } from "./time";
import type { Interval } from "./types";

/** Throws `InvalidTimeError` unless both ends are valid instants with start < end. */
export function assertValidInterval(interval: Interval): void {
  if (parseInstant(interval.start) >= parseInstant(interval.end)) {
    throw new InvalidTimeError("Interval start must be before its end");
  }
}

/** Half-open numeric overlap `[aStart, aEnd)` vs `[bStart, bEnd)`; the one overlap rule of the layer. */
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Intervals are half-open `[start, end)`: two intervals that merely touch (one
 * ends exactly when the other starts) do not overlap.
 */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return rangesOverlap(
    parseInstant(a.start),
    parseInstant(a.end),
    parseInstant(b.start),
    parseInstant(b.end),
  );
}
