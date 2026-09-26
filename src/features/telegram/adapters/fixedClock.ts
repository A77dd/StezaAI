import { addMinutes, InvalidTimeError, parseInstant } from "../domain";
import type { Clock, Instant } from "../domain";

export type FixedClock = Clock & {
  /** Moves time forward; negative or non-finite values are rejected. */
  advance(minutes: number): void;
  /** Jumps to an absolute instant (may move backwards, for test setup). */
  set(instant: Instant): void;
};

/** A clock that only moves when told to; used by tests and demos. */
export function createFixedClock(initial: Instant): FixedClock {
  parseInstant(initial);
  let current = initial;
  return {
    now: () => current,
    advance(minutes) {
      if (!Number.isFinite(minutes) || minutes < 0) {
        throw new InvalidTimeError("Clock can only advance by a finite, non-negative number of minutes");
      }
      current = addMinutes(current, minutes);
    },
    set(instant) {
      parseInstant(instant);
      current = instant;
    },
  };
}
