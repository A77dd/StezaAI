import type { Clock } from "../domain";

/** The real clock. Composition roots inject it; domain code never reads `Date` directly. */
export function createSystemClock(): Clock {
  return { now: () => new Date().toISOString() };
}
