import { MS_PER_DAY, parseInstant, toZonedParts } from "../domain";
import type { Instant, Slot, ZonedParts } from "../domain";
import { RenderError } from "./errors";
import { join, text, timeTag } from "./html";
import type { Html } from "./htmlType";

/**
 * Date, time and duration wording for the user's own timezone. Every
 * function is pure and takes `timezone` (and `now`) explicitly, so results
 * never depend on the machine's timezone or clock. Wall-clock values come from
 * the domain's `Intl`-based `toZonedParts`, which handles DST; day
 * differences are counted on calendar dates, never as `24 h * n`, so a
 * 23- or 25-hour day cannot shift "today"/"tomorrow".
 *
 * The words are a `TimeWords` value: Russian by default (`RU_TIME_WORDS`),
 * and each locale of the message catalog carries its own, so a new locale
 * replaces one object, not the logic.
 */

type Tuple7 = readonly [string, string, string, string, string, string, string];
type Tuple12 = readonly [
  string, string, string, string, string, string,
  string, string, string, string, string, string,
];

export type TimeWords = {
  /** Monday first. */
  readonly weekdaysShort: Tuple7;
  /** January first. */
  readonly monthsShort: Tuple12;
  readonly minutes: string;
  readonly hours: string;
  readonly today: string;
  readonly tomorrow: string;
  /** A short date such as `12 сент.`; `year` is null for the current year. */
  readonly date: (day: number, month: string, year: number | null) => string;
  /** A deadline date phrase such as `в пт, 12 сент.`. */
  readonly onDate: (weekday: string, date: string) => string;
};

export const RU_TIME_WORDS: TimeWords = {
  weekdaysShort: ["пн", "вт", "ср", "чт", "пт", "сб", "вс"],
  monthsShort: [
    "янв.",
    "февр.",
    "мар.",
    "апр.",
    "мая",
    "июн.",
    "июл.",
    "авг.",
    "сент.",
    "окт.",
    "нояб.",
    "дек.",
  ],
  minutes: "мин",
  hours: "ч",
  today: "сегодня",
  tomorrow: "завтра",
  date: (day, month, year) => (year === null ? `${day} ${month}` : `${day} ${month} ${year}`),
  onDate: (weekday, date) => `в ${weekday}, ${date}`,
};

const MINUTES_PER_HOUR = 60;
const SLOT_START_FORMAT = "wDt"; // weekday, long date, short time
const SLOT_TIME_FORMAT = "t";
const RANGE_DASH = "–";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function clock(parts: ZonedParts): string {
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

function weekday(parts: ZonedParts, words: TimeWords): string {
  return words.weekdaysShort[parts.isoWeekday - 1];
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

type SlotView = {
  readonly start: ZonedParts;
  readonly end: ZonedParts;
  readonly sameDay: boolean;
};

function viewSlot(slot: Slot, timezone: string): SlotView {
  if (parseInstant(slot.end) <= parseInstant(slot.start)) {
    throw new RenderError("Slot must end after it starts");
  }
  const start = toZonedParts(slot.start, timezone);
  const end = toZonedParts(slot.end, timezone);
  return { start, end, sameDay: isSameLocalDay(start, end) };
}

/**
 * Plain-text slot, for places that cannot hold a `tg-time` tag (button
 * labels, copy text): `пт, 15:00–16:00`, or `пт, 23:30 – сб, 00:30` when it
 * crosses local midnight.
 */
export function formatSlotRange(
  slot: Slot,
  timezone: string,
  words: TimeWords = RU_TIME_WORDS,
): string {
  const { start, end, sameDay } = viewSlot(slot, timezone);
  const from = `${weekday(start, words)}, ${clock(start)}`;
  return sameDay
    ? `${from}${RANGE_DASH}${clock(end)}`
    : `${from} ${RANGE_DASH} ${weekday(end, words)}, ${clock(end)}`;
}

function unixSeconds(instant: Instant): number {
  return Math.floor(parseInstant(instant) / 1000);
}

/**
 * The slot as two `tg-time` tags: each reader sees the moments in their own
 * timezone, and the fallback text (older clients) is in the USER's timezone.
 * Both ends are tags rather than a tag plus a plain `–16:00`, because a plain
 * end time would stay in the user's zone while the start shifted to the
 * reader's.
 */
export function slotHtml(slot: Slot, timezone: string, words: TimeWords = RU_TIME_WORDS): Html {
  const { start, end, sameDay } = viewSlot(slot, timezone);
  const startTag = timeTag(
    unixSeconds(slot.start),
    SLOT_START_FORMAT,
    `${weekday(start, words)}, ${clock(start)}`,
  );
  const endTag = sameDay
    ? timeTag(unixSeconds(slot.end), SLOT_TIME_FORMAT, clock(end))
    : timeTag(unixSeconds(slot.end), SLOT_START_FORMAT, `${weekday(end, words)}, ${clock(end)}`);
  return join([startTag, text(RANGE_DASH), endTag]);
}

/**
 * `30 мин`, `2 ч`, `1 ч 30 мин`. Both units are abbreviations, so they do
 * not decline and no plural rules are needed (a locale whose units decline
 * needs its own formatter). Above a day it keeps counting
 * hours (`25 ч`). Zero, negative and fractional values are bugs upstream and
 * throw instead of rendering nonsense.
 */
export function formatDuration(minutes: number, words: TimeWords = RU_TIME_WORDS): string {
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
 * Deadline as a date only: `сегодня`, `завтра`, else `в пт, 12 сент.` (with
 * the year when it differs from `now`'s: `в вт, 5 янв. 2027`). Days are
 * compared in the user's timezone. A past date is shown as a date, not
 * softened into "yesterday".
 */
export function formatDeadline(
  instant: Instant,
  timezone: string,
  now: Instant,
  words: TimeWords = RU_TIME_WORDS,
): string {
  const deadline = toZonedParts(instant, timezone);
  const current = toZonedParts(now, timezone);
  const daysAhead = dayNumber(deadline) - dayNumber(current);
  if (daysAhead === 0) return words.today;
  if (daysAhead === 1) return words.tomorrow;
  const year = deadline.year === current.year ? null : deadline.year;
  const date = words.date(deadline.day, words.monthsShort[deadline.month - 1], year);
  return words.onDate(weekday(deadline, words), date);
}
