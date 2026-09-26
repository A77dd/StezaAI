import { toZonedParts } from "../domain";
import type { Instant } from "../domain";
import { calendarDaysBetween } from "./format";
import { weekdayName, yearUnlessCurrent } from "./timeWords";
import type { TimeWords } from "./timeWords";

/** Upper-cases the first letter (`завтра` becomes `Завтра`); other letters are left as they are. */
export function capitalizeFirst(value: string): string {
  return value === "" ? value : value[0].toUpperCase() + value.slice(1);
}

/** The weekday reads unambiguously for this many days ahead; beyond it the date is shown. */
const LAST_WEEKDAY_LABEL_DAY = 6;

/**
 * Short relative day for button labels: `Сегодня`, `Завтра`, `Чт` (up to six
 * days ahead), else the date (`30 сент.`, with the year when it is not the
 * current one). A day in the past is a date, never a weekday, so it cannot
 * be mistaken for an upcoming one. Days are compared in the user's timezone.
 */
export function formatDayLabel(instant: Instant, timezone: string, now: Instant, words: TimeWords): string {
  const daysAhead = calendarDaysBetween(now, instant, timezone);
  if (daysAhead === 0) return capitalizeFirst(words.today);
  if (daysAhead === 1) return capitalizeFirst(words.tomorrow);
  const parts = toZonedParts(instant, timezone);
  if (daysAhead >= 2 && daysAhead <= LAST_WEEKDAY_LABEL_DAY) {
    return capitalizeFirst(weekdayName(words, parts.isoWeekday));
  }
  const year = yearUnlessCurrent(parts.year, toZonedParts(now, timezone).year);
  return words.date(parts.day, words.monthsShort[parts.month - 1], year);
}
