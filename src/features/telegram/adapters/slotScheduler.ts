import { InvalidIntentError } from "../domain/errors";
import { assertValidInterval } from "../domain/intervals";
import type { SlotScheduler } from "../domain/ports";
import { assertValidSettings } from "../domain/settings";
import {
  formatInstant,
  fromZoned,
  parseClockTime,
  parseInstant,
  toZonedParts,
} from "../domain/time";
import type { Priority, Slot, UserSettings } from "../domain/types";

/**
 * Deterministic slot search (the scheduler of the product loop; it never
 * calls the LLM).
 *
 * Search space
 * - Candidate starts lie on a 30-minute grid of LOCAL wall-clock time in the
 *   user's timezone, beginning at `now` rounded up to the next grid point
 *   (a `now` that is already on the grid is kept).
 * - Only working days and working hours count. A block must fit completely
 *   inside ONE working window, so it never spans midnight or a weekend. On a
 *   DST day the window has its real length (a 01:00-04:00 window is two hours
 *   long on a spring-forward day and three on a fall-back day).
 * - A block must not overlap any busy interval (half-open) and must end at or
 *   before the deadline. Without a deadline the search covers 7 days; with a
 *   distant deadline it is capped at `MAX_SEARCH_DAYS` days.
 * - Block length is `task.durationMinutes`. `settings.defaultBlockMinutes` is
 *   used only when the task has no duration (`null`), never to override one.
 *
 * Selection (0-3 slots, returned in chronological order)
 * - normal: the earliest slot first; further slots are chosen so that they do
 *   not overlap already chosen ones, then fall on a different local day, then
 *   in a different time of day (morning < 12:00, afternoon < 17:00, evening),
 *   and finally are earliest.
 * - high: the earliest slots, preferring non-overlapping ones. No spreading.
 * - low: like normal, but the first day that has free time is skipped when
 *   another day has free time, so low-priority work does not take today.
 * Ties are always broken by start time, so identical input gives identical
 * output. The function is pure and does not mutate its input.
 */

const GRID_MINUTES = 30;
const DEFAULT_SEARCH_DAYS = 7;
const MAX_SEARCH_DAYS = 60;
const MAX_SLOTS = 3;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

type Candidate = {
  readonly startMs: number;
  readonly endMs: number;
  /** Local date of the working window, `YYYY-MM-DD`. */
  readonly day: string;
  readonly partOfDay: "morning" | "afternoon" | "evening";
};

function partOfDay(hour: number): Candidate["partOfDay"] {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Smallest local-grid instant at or after `ms`, in epoch milliseconds. */
function ceilToGrid(ms: number, timezone: string): number {
  const wholeMinute = Math.ceil(ms / MS_PER_MINUTE) * MS_PER_MINUTE;
  const { minute } = toZonedParts(formatInstant(wholeMinute), timezone);
  return wholeMinute + ((GRID_MINUTES - (minute % GRID_MINUTES)) % GRID_MINUTES) * MS_PER_MINUTE;
}

function collectCandidates(input: {
  timezone: string;
  workingHours: UserSettings["workingHours"];
  durationMs: number;
  nowMs: number;
  horizonMs: number;
  busy: readonly { startMs: number; endMs: number }[];
}): Candidate[] {
  const { timezone, workingHours, durationMs, nowMs, horizonMs, busy } = input;
  const startMinutes = parseClockTime(workingHours.start);
  const endMinutes = parseClockTime(workingHours.end);
  const today = toZonedParts(formatInstant(nowMs), timezone);
  const candidates: Candidate[] = [];

  for (let offset = 0; ; offset += 1) {
    // Rolling `day + offset` over normalises month and year ends.
    const midnight = fromZoned(
      { year: today.year, month: today.month, day: today.day + offset, hour: 0, minute: 0 },
      timezone,
    );
    if (parseInstant(midnight) > horizonMs) break;

    const date = toZonedParts(midnight, timezone);
    if (!workingHours.isoDays.includes(date.isoWeekday)) continue;

    const local = { year: date.year, month: date.month, day: date.day };
    const windowStartMs = parseInstant(
      fromZoned({ ...local, hour: Math.floor(startMinutes / 60), minute: startMinutes % 60 }, timezone),
    );
    const windowEndMs = parseInstant(
      fromZoned({ ...local, hour: Math.floor(endMinutes / 60), minute: endMinutes % 60 }, timezone),
    );
    const day = `${date.year}-${pad(date.month)}-${pad(date.day)}`;

    for (
      let startMs = ceilToGrid(Math.max(windowStartMs, nowMs), timezone);
      startMs + durationMs <= windowEndMs && startMs + durationMs <= horizonMs;
      startMs += GRID_MINUTES * MS_PER_MINUTE
    ) {
      const endMs = startMs + durationMs;
      if (busy.some((interval) => startMs < interval.endMs && interval.startMs < endMs)) continue;
      const { hour } = toZonedParts(formatInstant(startMs), timezone);
      candidates.push({ startMs, endMs, day, partOfDay: partOfDay(hour) });
    }
  }
  return candidates.sort((a, b) => a.startMs - b.startMs);
}

function overlaps(a: Candidate, b: Candidate): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/** Picks up to MAX_SLOTS candidates from `pool` (already sorted by start). */
function select(pool: readonly Candidate[], priority: Priority): Candidate[] {
  const [first] = pool;
  if (first === undefined) return [];
  const picked: Candidate[] = [first];

  while (picked.length < MAX_SLOTS) {
    let best: Candidate | undefined;
    let bestScore: readonly number[] = [];
    for (const candidate of pool) {
      if (picked.includes(candidate)) continue;
      const disjoint = picked.every((chosen) => !overlaps(chosen, candidate));
      const score =
        priority === "high"
          ? [disjoint ? 1 : 0]
          : [
              disjoint ? 1 : 0,
              picked.some((chosen) => chosen.day === candidate.day) ? 0 : 1,
              picked.some((chosen) => chosen.partOfDay === candidate.partOfDay) ? 0 : 1,
            ];
      // The pool is sorted by start, so the first candidate with the highest
      // score is also the earliest one: strict `>` keeps that tie-break.
      if (best === undefined || compareScores(score, bestScore) > 0) {
        best = candidate;
        bestScore = score;
      }
    }
    if (best === undefined) break;
    picked.push(best);
  }
  return picked.sort((a, b) => a.startMs - b.startMs);
}

function compareScores(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < a.length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function createSlotScheduler(): SlotScheduler {
  return {
    propose({ task, busy, settings, now }): Slot[] {
      assertValidSettings(settings);
      const nowMs = parseInstant(now);

      const durationMinutes = task.durationMinutes ?? settings.defaultBlockMinutes;
      if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
        throw new InvalidIntentError("Task duration must be a positive whole number of minutes");
      }

      const busyMs = busy.map((interval) => {
        assertValidInterval(interval);
        return { startMs: parseInstant(interval.start), endMs: parseInstant(interval.end) };
      });

      const deadlineMs = task.deadline === null ? null : parseInstant(task.deadline);
      const horizonMs =
        deadlineMs === null
          ? nowMs + DEFAULT_SEARCH_DAYS * MS_PER_DAY
          : Math.min(deadlineMs, nowMs + MAX_SEARCH_DAYS * MS_PER_DAY);
      if (horizonMs <= nowMs) return [];

      const candidates = collectCandidates({
        timezone: settings.timezone,
        workingHours: settings.workingHours,
        durationMs: durationMinutes * MS_PER_MINUTE,
        nowMs,
        horizonMs,
        busy: busyMs,
      });

      let pool = candidates;
      if (task.priority === "low") {
        const firstDay = candidates[0]?.day;
        const laterDays = candidates.filter((candidate) => candidate.day !== firstDay);
        if (laterDays.length > 0) pool = laterDays;
      }

      return select(pool, task.priority).map((candidate) => ({
        start: formatInstant(candidate.startMs),
        end: formatInstant(candidate.endMs),
      }));
    },
  };
}
