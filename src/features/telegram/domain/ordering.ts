import { parseInstant } from "./time";
import type { Instant } from "./types";

/**
 * Comparator for stable, deterministic listings: by instant (as time, not as
 * text), then by id. Used for tasks by `createdAt` and reminders by `dueAt`.
 */
export function compareByTimeThenId<T extends { readonly id: string }>(
  instantOf: (item: T) => Instant,
): (a: T, b: T) => number {
  return (a, b) => {
    const byTime = parseInstant(instantOf(a)) - parseInstant(instantOf(b));
    if (byTime !== 0) return byTime;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}
