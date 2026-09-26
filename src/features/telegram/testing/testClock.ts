import { createFixedClock } from "../adapters/fixedClock";
import type { FixedClock } from "../adapters/fixedClock";
import { formatInstant, parseInstant } from "../domain";
import type { Instant } from "../domain";

/** Wednesday 2026-09-23, 12:00 in Moscow: the instant the view fixtures use. */
export const DEFAULT_TEST_START: Instant = "2026-09-23T09:00:00.000Z";

export type TestClock = FixedClock & {
  /** Current time in epoch milliseconds. */
  nowMs(): number;
  /** Moves time forward with millisecond precision (rate limit tests). */
  advanceMs(ms: number): void;
  advanceSeconds(seconds: number): void;
};

/**
 * The injected clock of the fake Bot API and the update builders: it only
 * moves when told to, so a test never depends on real time or timers.
 */
export function createTestClock(initial: Instant = DEFAULT_TEST_START): TestClock {
  const fixed = createFixedClock(initial);
  const advanceMs = (ms: number): void => {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new RangeError("Clock can only advance by a finite, non-negative number of milliseconds");
    }
    fixed.set(formatInstant(parseInstant(fixed.now()) + ms));
  };
  return {
    ...fixed,
    nowMs: () => parseInstant(fixed.now()),
    advanceMs,
    advanceSeconds: (seconds) => advanceMs(seconds * 1000),
  };
}
