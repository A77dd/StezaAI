import { parseInstant, toZonedParts } from "../domain";
import type { Instant } from "../domain";
import { calendarDaysBetween, formatClock, RU_TIME_WORDS } from "./format";
import type { TimeWords } from "./format";
import { timeTag } from "./html";
import type { Html } from "./htmlType";

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
export function formatDayLabel(
  instant: Instant,
  timezone: string,
  now: Instant,
  words: TimeWords = RU_TIME_WORDS,
): string {
  const daysAhead = calendarDaysBetween(now, instant, timezone);
  if (daysAhead === 0) return capitalizeFirst(words.today);
  if (daysAhead === 1) return capitalizeFirst(words.tomorrow);
  const parts = toZonedParts(instant, timezone);
  if (daysAhead >= 2 && daysAhead <= LAST_WEEKDAY_LABEL_DAY) {
    return capitalizeFirst(words.weekdaysShort[parts.isoWeekday - 1]);
  }
  const currentYear = toZonedParts(now, timezone).year;
  const year = parts.year === currentYear ? null : parts.year;
  return words.date(parts.day, words.monthsShort[parts.month - 1], year);
}

/** `пт, 16:00`: weekday and local time of one instant, for places without a `tg-time` tag. */
export function formatMoment(
  instant: Instant,
  timezone: string,
  words: TimeWords = RU_TIME_WORDS,
): string {
  const weekday = words.weekdaysShort[toZonedParts(instant, timezone).isoWeekday - 1];
  return `${weekday}, ${formatClock(instant, timezone)}`;
}

/** One instant as a `tg-time` tag: readers see it in their own timezone, old clients the user's. */
export function momentHtml(
  instant: Instant,
  timezone: string,
  words: TimeWords = RU_TIME_WORDS,
): Html {
  return timeTag(Math.floor(parseInstant(instant) / 1000), "wDt", formatMoment(instant, timezone, words));
}
