import { InvalidSettingsError } from "./errors";
import { assertValidTimezone, parseClockTime } from "./time";
import type { Locale, UserId, UserSettings } from "./types";

const MINUTES_PER_DAY = 24 * 60;

/**
 * Explicit defaults for a user who has not configured anything yet.
 * Repositories never fabricate these: `SettingsRepository.get` returns `null`
 * for unknown users and the caller decides to call this function.
 *
 * The timezone is `UTC` on purpose: the Bot API gives no timezone and a guess
 * (for example from `language_code`) would silently schedule at wrong local
 * times. Flows must ask the user to confirm a timezone before proposing slots.
 */
export function createDefaultSettings(userId: UserId, locale: Locale): UserSettings {
  return {
    userId,
    timezone: "UTC",
    locale,
    workingHours: { isoDays: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" },
    defaultBlockMinutes: 30,
    notificationIntensity: "normal",
    calendarConnected: false,
  };
}

/** Throws a typed error if the settings break an invariant the scheduler relies on. */
export function assertValidSettings(settings: UserSettings): void {
  normalizeSettings(settings);
}

/**
 * Validates the settings and returns a deep copy with the canonical timezone
 * name. Repositories store the result, never the raw input.
 */
export function normalizeSettings(settings: UserSettings): UserSettings {
  const timezone = assertValidTimezone(settings.timezone);

  const { isoDays, start, end } = settings.workingHours;
  if (parseClockTime(start) >= parseClockTime(end)) {
    throw new InvalidSettingsError("Working hours must start before they end on the same day");
  }
  const validDays = isoDays.every((day) => Number.isInteger(day) && day >= 1 && day <= 7);
  if (!validDays || new Set(isoDays).size !== isoDays.length) {
    throw new InvalidSettingsError("Working days must be unique ISO weekdays from 1 to 7");
  }

  const minutes = settings.defaultBlockMinutes;
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > MINUTES_PER_DAY) {
    throw new InvalidSettingsError("Default block length must be a whole number of minutes in 1..1440");
  }
  return {
    ...settings,
    timezone,
    workingHours: { ...settings.workingHours, isoDays: [...isoDays] },
  };
}
