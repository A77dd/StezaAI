import { InvalidTimeError, InvalidTimezoneError } from "./errors";
import type { Instant } from "./types";

/**
 * Pure, dependency-free time helpers built on `Intl`. Instants are ISO-8601
 * UTC strings (`YYYY-MM-DDTHH:MM:SS[.mmm]Z`); values produced by this module
 * always use the canonical `toISOString()` form with milliseconds.
 * User-local logic always goes through an explicit IANA timezone.
 */

export type ZonedParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  /** ISO weekday: 1 = Monday ... 7 = Sunday. */
  readonly isoWeekday: number;
};

export type LocalDateTime = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
};

export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
const INSTANT_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/;
/** Years this module supports: always four digits in ISO-8601 and never ambiguous with 2-digit years. */
const MIN_YEAR = 1000;
const MAX_YEAR = 9999;
const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Parses a strict ISO-8601 UTC instant into epoch milliseconds. Impossible
 * dates and times (`2026-02-30`, hour 24, minute 60) are rejected: `Date.parse`
 * would silently roll some of them over, so the value must round-trip.
 */
export function parseInstant(instant: Instant): number {
  const match = INSTANT_PATTERN.exec(instant);
  const ms = match === null ? Number.NaN : Date.parse(instant);
  if (match !== null && !Number.isNaN(ms)) {
    const canonical = `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`;
    if (new Date(ms).toISOString() === canonical) return ms;
  }
  throw new InvalidTimeError(
    "Instant must be a valid ISO-8601 UTC string like 2026-09-25T20:59:00.000Z",
  );
}

/** Formats epoch milliseconds as a canonical Instant (years 1000-9999 only). */
export function formatInstant(ms: number): Instant {
  const year = Number.isFinite(ms) ? new Date(ms).getUTCFullYear() : Number.NaN;
  if (!(year >= MIN_YEAR && year <= MAX_YEAR)) {
    throw new InvalidTimeError(
      `Epoch milliseconds must be finite and fall in the years ${MIN_YEAR}-${MAX_YEAR}`,
    );
  }
  return new Date(ms).toISOString();
}

/** Adds (or, for negative values, subtracts) real minutes on the timeline. */
export function addMinutes(instant: Instant, minutes: number): Instant {
  if (!Number.isFinite(minutes)) {
    throw new InvalidTimeError("Minutes must be a finite number");
  }
  return formatInstant(parseInstant(instant) + minutes * MS_PER_MINUTE);
}

/**
 * Parses a `HH:MM` wall-clock time (24-hour, zero padded) into minutes after
 * local midnight.
 */
export function parseClockTime(value: string): number {
  const match = CLOCK_PATTERN.exec(value);
  if (match === null) {
    throw new InvalidTimeError("Clock time must be HH:MM in 24-hour format");
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const canonicalNames = new Map<string, string>();
// "+03:00", "-0500": offsets carry no DST rules.
const OFFSET_FORM = /^[+-]/;
// "Etc/GMT+3" and friends are fixed offsets with inverted signs, never a user's home zone.
const FIXED_OFFSET_ZONE = /^Etc\//i;

function createFormatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
  } catch (error) {
    // Intl signals an unknown timezone with RangeError; anything else is a bug.
    if (error instanceof RangeError) {
      throw new InvalidTimezoneError(
        "Timezone must be an IANA identifier such as Europe/Moscow",
        { cause: error },
      );
    }
    throw error;
  }
}

/** Resolves any accepted spelling to the canonical name; the formatter cache is keyed by it. */
function canonicalTimezone(timezone: string): string {
  const known = canonicalNames.get(timezone);
  if (known !== undefined) return known;
  if (OFFSET_FORM.test(timezone) || FIXED_OFFSET_ZONE.test(timezone)) {
    throw new InvalidTimezoneError(
      "Timezone must be a named IANA zone; UTC offsets and fixed-offset Etc/ zones are not supported",
    );
  }
  const formatter = createFormatter(timezone);
  const canonical = formatter.resolvedOptions().timeZone;
  if (!formatters.has(canonical)) formatters.set(canonical, formatter);
  canonicalNames.set(timezone, canonical);
  return canonical;
}

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const formatter = formatters.get(canonicalTimezone(timezone));
  if (formatter === undefined) {
    throw new InvalidTimezoneError("Timezone formatter is unavailable");
  }
  return formatter;
}

/**
 * Throws `InvalidTimezoneError` unless `timezone` is a named IANA zone the
 * runtime knows, and returns its canonical name (`europe/moscow` becomes
 * `Europe/Moscow`). Offset forms (`+03:00`) and fixed-offset `Etc/` zones are
 * rejected by explicit rules: they carry no DST rules and no user lives in
 * them. Store the returned name, not the input.
 */
export function assertValidTimezone(timezone: string): string {
  return canonicalTimezone(timezone);
}

function partsOf(ms: number, timezone: string) {
  const values = new Map<string, number>();
  for (const part of formatterFor(timezone).formatToParts(new Date(ms))) {
    if (part.type !== "literal") values.set(part.type, Number(part.value));
  }
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  const hour = values.get("hour");
  const minute = values.get("minute");
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    throw new InvalidTimeError("Could not resolve local time parts");
  }
  return { year, month, day, hour, minute };
}

/** Wall-clock components of an instant in the given timezone. */
export function toZonedParts(instant: Instant, timezone: string): ZonedParts {
  const ms = parseInstant(instant);
  const parts = partsOf(ms, timezone);
  const utcDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return { ...parts, isoWeekday: utcDay === 0 ? 7 : utcDay };
}

/** Local wall time interpreted as if it were UTC, in epoch milliseconds. */
function wallAsUtc(parts: LocalDateTime): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

/** Offset of the timezone at an instant, in ms (local wall time minus UTC). */
function offsetAt(ms: number, timezone: string): number {
  return wallAsUtc(partsOf(ms, timezone)) - Math.floor(ms / MS_PER_MINUTE) * MS_PER_MINUTE;
}

/**
 * Converts local wall-clock time in `timezone` to an Instant, deterministically
 * across DST changes:
 * - a local time that does not exist (spring-forward gap) moves forward by the
 *   length of the gap, e.g. Berlin 02:30 on 2026-03-29 becomes 03:30 CEST;
 * - a local time that occurs twice (fall-back overlap) resolves to the EARLIER
 *   instant, i.e. the one before the clocks are turned back.
 *
 * Out-of-range fields roll over like `Date.UTC` (day 32, hour 24, ...), which
 * lets callers step local dates with `day + n`. Fields must be integers, the
 * year must be 1000-9999, and a roll-over may not leave that range.
 */
export function fromZoned(local: LocalDateTime, timezone: string): Instant {
  for (const value of [local.year, local.month, local.day, local.hour, local.minute]) {
    if (!Number.isInteger(value)) {
      throw new InvalidTimeError("Local date and time fields must be integers");
    }
  }
  // Date.UTC would silently map years 0-99 to 1900-1999.
  if (local.year < MIN_YEAR || local.year > MAX_YEAR) {
    throw new InvalidTimeError(`Year must be between ${MIN_YEAR} and ${MAX_YEAR}`);
  }
  const wall = wallAsUtc(local);
  // Offsets before and after any transition near this wall time.
  const offsetBefore = offsetAt(wall - MS_PER_DAY, timezone);
  const offsetAfter = offsetAt(wall + MS_PER_DAY, timezone);
  const candidates = [...new Set([offsetBefore, offsetAfter])]
    .map((offset) => wall - offset)
    .filter((candidate) => offsetAt(candidate, timezone) + candidate === wall)
    .sort((a, b) => a - b);
  const [earliest] = candidates;
  // No candidate: the wall time falls in a gap. Applying the pre-transition
  // offset moves it forward by the length of the gap.
  return formatInstant(earliest ?? wall - offsetBefore);
}

/** The instant of local midnight of the date containing `instant`. */
export function startOfDayInZone(instant: Instant, timezone: string): Instant {
  const { year, month, day } = toZonedParts(instant, timezone);
  return fromZoned({ year, month, day, hour: 0, minute: 0 }, timezone);
}
