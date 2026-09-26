import { MS_PER_DAY, MS_PER_MINUTE, parseInstant, toZonedParts } from "../domain";
import type { Instant, Slot, ZonedParts } from "../domain";
import { RenderError } from "./errors";
import { join, text, timeTag } from "./html";
import type { Html } from "./htmlType";
import { weekdayName, yearUnlessCurrent } from "./timeWords";
import type { TimeWords } from "./timeWords";

/**
 * Date, time and duration wording for the user's own timezone. Every
 * function is pure and takes `timezone` (and `now`) explicitly, so results
 * never depend on the machine's timezone or clock. Wall-clock values come from
 * the domain's `Intl`-based `toZonedParts`, which handles DST; day
 * differences are counted on calendar dates, never as `24 h * n`, so a
 * 23- or 25-hour day cannot shift "today"/"tomorrow".
 *
 * The words are a required `TimeWords` argument (see `timeWords.ts`): each
 * locale of the message catalog carries its own, and nothing here falls back
 * to Russian.
 */

const MINUTES_PER_HOUR = 60;
/** `tg-time` format for the start of a slot: weekday, long date, short time. */
export const SLOT_START_FORMAT = "wDt";
const SLOT_TIME_FORMAT = "t";
export const RANGE_DASH = "–";

/** Whole seconds since the epoch, the unit of `tg-time` and `tg://time`. */
export function instantToUnixSeconds(instant: Instant): number {
  return Math.floor(parseInstant(instant) / 1000);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function clock(parts: ZonedParts): string {
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

function isSameLocalDay(a: ZonedParts, b: ZonedParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** Calendar day number of a local date: differences are whole days whatever the DST shifts. */
function dayNumber(parts: ZonedParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day) / MS_PER_DAY;
}

/** Zero-padded local wall clock, `06:05`. */
export function formatClock(instant: Instant, timezone: string): string {
  return clock(toZonedParts(instant, timezone));
}

/**
 * Whole local calendar days from `from` to `to` in the user's timezone
 * (0 = same day, negative = `to` is earlier).
 */
export function calendarDaysBetween(from: Instant, to: Instant, timezone: string): number {
  return dayNumber(toZonedParts(to, timezone)) - dayNumber(toZonedParts(from, timezone));
}

/** The timezone's offset from UTC at an instant, in minutes (local wall time minus UTC). */
function utcOffsetMinutes(instant: Instant, timezone: string): number {
  const parts = toZonedParts(instant, timezone);
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return (wall - Math.floor(parseInstant(instant) / MS_PER_MINUTE) * MS_PER_MINUTE) / MS_PER_MINUTE;
}

/** `UTC`, `UTC+2`, `UTC-3`, `UTC+5:30`. */
function formatUtcOffset(minutes: number): string {
  if (minutes === 0) return "UTC";
  const rest = Math.abs(minutes) % MINUTES_PER_HOUR;
  const hours = Math.floor(Math.abs(minutes) / MINUTES_PER_HOUR);
  return `UTC${minutes < 0 ? "-" : "+"}${hours}${rest === 0 ? "" : `:${pad(rest)}`}`;
}

type SlotView = {
  readonly start: ZonedParts;
  readonly end: ZonedParts;
  readonly sameDay: boolean;
  /** Wall-clock times as text; each carries its UTC offset when the clocks changed inside the slot. */
  readonly startClock: string;
  readonly endClock: string;
};

function viewSlot(slot: Slot, timezone: string): SlotView {
  if (parseInstant(slot.end) <= parseInstant(slot.start)) {
    throw new RenderError("Slot must end after it starts");
  }
  const start = toZonedParts(slot.start, timezone);
  const end = toZonedParts(slot.end, timezone);
  const startOffset = utcOffsetMinutes(slot.start, timezone);
  const endOffset = utcOffsetMinutes(slot.end, timezone);
  // A slot across a DST change reads "02:30-02:30" without its offsets.
  const withOffset = (time: string, offset: number) =>
    startOffset === endOffset ? time : `${time} (${formatUtcOffset(offset)})`;
  return {
    start,
    end,
    sameDay: isSameLocalDay(start, end),
    startClock: withOffset(clock(start), startOffset),
    endClock: withOffset(clock(end), endOffset),
  };
}

/**
 * Plain-text slot, for places that cannot hold a `tg-time` tag (button
 * labels, copy text): `пт, 15:00–16:00`, or `пт, 23:30 – сб, 00:30` when it
 * crosses local midnight. When the clocks change inside the slot each time
 * carries its UTC offset (`вс, 02:30 (UTC+2)–02:30 (UTC+1)`).
 */
export function formatSlotRange(slot: Slot, timezone: string, words: TimeWords): string {
  const { start, end, sameDay, startClock, endClock } = viewSlot(slot, timezone);
  const from = `${weekdayName(words, start.isoWeekday)}, ${startClock}`;
  return sameDay
    ? `${from}${RANGE_DASH}${endClock}`
    : `${from} ${RANGE_DASH} ${weekdayName(words, end.isoWeekday)}, ${endClock}`;
}

/**
 * The slot as two `tg-time` tags: each reader sees the moments in their own
 * timezone, and the fallback text (older clients) is in the USER's timezone.
 * Both ends are tags rather than a tag plus a plain `–16:00`, because a plain
 * end time would stay in the user's zone while the start shifted to the
 * reader's.
 */
export function slotHtml(slot: Slot, timezone: string, words: TimeWords): Html {
  const { start, end, sameDay, startClock, endClock } = viewSlot(slot, timezone);
  const startTag = timeTag(
    instantToUnixSeconds(slot.start),
    SLOT_START_FORMAT,
    `${weekdayName(words, start.isoWeekday)}, ${startClock}`,
  );
  const endTag = sameDay
    ? timeTag(instantToUnixSeconds(slot.end), SLOT_TIME_FORMAT, endClock)
    : timeTag(
        instantToUnixSeconds(slot.end),
        SLOT_START_FORMAT,
        `${weekdayName(words, end.isoWeekday)}, ${endClock}`,
      );
  return join([startTag, text(RANGE_DASH), endTag]);
}

/**
 * `30 мин`, `2 ч`, `1 ч 30 мин`. Both units are abbreviations, so they do
 * not decline and no plural rules are needed (a locale whose units decline
 * needs its own formatter). Above a day it keeps counting hours (`25 ч`).
 * Zero, negative and fractional values are bugs upstream and throw instead of
 * rendering nonsense.
 */
export function formatDuration(minutes: number, words: TimeWords): string {
  if (!Number.isInteger(minutes) || minutes < 1) {
    throw new RenderError("Duration must be a whole number of minutes, at least 1");
  }
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${words.hours}`);
  if (rest > 0) parts.push(`${rest} ${words.minutes}`);
  return parts.join(" ");
}

/**
 * Deadline as a date only: `сегодня`, `завтра`, else the locale's date phrase
 * (`в пт, 12 сент.`, with the year when it differs from `now`'s: `в вт, 5
 * янв. 2027`). Days are compared in the user's timezone. A past date is shown
 * as a date, not softened into "yesterday".
 */
export function formatDeadline(instant: Instant, timezone: string, now: Instant, words: TimeWords): string {
  const deadline = toZonedParts(instant, timezone);
  const current = toZonedParts(now, timezone);
  const daysAhead = dayNumber(deadline) - dayNumber(current);
  if (daysAhead === 0) return words.today;
  if (daysAhead === 1) return words.tomorrow;
  const year = yearUnlessCurrent(deadline.year, current.year);
  const date = words.date(deadline.day, words.monthsShort[deadline.month - 1], year);
  return words.onDate(weekdayName(words, deadline.isoWeekday), date);
}
