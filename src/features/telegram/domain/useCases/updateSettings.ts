import { assertValidTimezone, InvalidSettingsError, NOTIFICATION_INTENSITIES } from "../index";
import type { DraftId, NotificationIntensity, UserId, UserSettings, WorkingHours } from "../index";
import type { PersonalFlowPorts } from "./ports";
import { createSubmitText } from "./submitText";
import type { SubmitTextResult } from "./submitText";
import { requireSettings } from "./shared";

/**
 * `updateSettings` family: one small use-case per settings field, each
 * loading the current settings, validating and re-saving them (`upsert`
 * re-validates too, but failing here keeps the error specific to the field
 * that was wrong).
 */

// --- setTimezone --------------------------------------------------------------

export type SetTimezoneInput = {
  readonly userId: UserId;
  readonly tz: string;
  /** A `timezone`-kind draft saved by `submitText` while the timezone was unconfirmed. */
  readonly draftId?: DraftId;
};

/** Replaying a draft can never itself ask for a timezone again: it was just confirmed. */
export type SetTimezoneResult = { readonly kind: "timezone_set"; readonly settings: UserSettings } | Exclude<
  SubmitTextResult,
  { readonly kind: "timezone_required" }
>;

type SetTimezonePorts = Pick<
  PersonalFlowPorts,
  "settings" | "drafts" | "tasks" | "proposals" | "calendar" | "scheduler" | "intentParser" | "clock" | "ids"
>;

/**
 * Confirms the user's timezone. If `draftId` names a draft (the text the user
 * sent before the timezone was confirmed), it is replayed through
 * `submitText` and its outcome is returned instead of a bare confirmation.
 */
export function createSetTimezone(ports: SetTimezonePorts) {
  const submitText = createSubmitText(ports);
  return async function setTimezone(input: SetTimezoneInput): Promise<SetTimezoneResult> {
    const canonical = assertValidTimezone(input.tz);
    const settings = await requireSettings(ports, input.userId);
    const updated = await ports.settings.upsert({ ...settings, timezone: canonical, timezoneConfirmed: true });

    if (input.draftId === undefined) {
      return { kind: "timezone_set", settings: updated };
    }
    const draft = await ports.drafts.get(input.userId, input.draftId);
    if (draft === null) {
      return { kind: "timezone_set", settings: updated };
    }
    await ports.drafts.delete(input.userId, input.draftId);
    const replayed = await submitText({
      dateTimeHints: draft.dateTimeHints ?? [],
      userId: input.userId,
      chatId: draft.chatId,
      text: draft.source.sourceText,
      source: draft.source,
    });
    return replayed as SetTimezoneResult;
  };
}

// --- setNotificationIntensity ---------------------------------------------------

export type SetNotificationIntensityInput = { readonly userId: UserId; readonly intensity: string };

/** Accepts a raw string (as a callback payload would carry) and validates it explicitly. */
export function createSetNotificationIntensity(ports: Pick<PersonalFlowPorts, "settings">) {
  return async function setNotificationIntensity(input: SetNotificationIntensityInput): Promise<UserSettings> {
    if (!(NOTIFICATION_INTENSITIES as readonly string[]).includes(input.intensity)) {
      throw new InvalidSettingsError(
        `Notification intensity must be one of ${NOTIFICATION_INTENSITIES.join(", ")}`,
      );
    }
    const settings = await requireSettings(ports, input.userId);
    return ports.settings.upsert({
      ...settings,
      notificationIntensity: input.intensity as NotificationIntensity,
    });
  };
}

// --- setBlockLength ---------------------------------------------------------

export type SetBlockLengthInput = { readonly userId: UserId; readonly minutes: number };

const MIN_BLOCK_MINUTES = 15;
const MAX_BLOCK_MINUTES = 240;
const BLOCK_MINUTES_STEP = 5;

export function createSetBlockLength(ports: Pick<PersonalFlowPorts, "settings">) {
  return async function setBlockLength(input: SetBlockLengthInput): Promise<UserSettings> {
    if (
      !Number.isInteger(input.minutes) ||
      input.minutes < MIN_BLOCK_MINUTES ||
      input.minutes > MAX_BLOCK_MINUTES ||
      input.minutes % BLOCK_MINUTES_STEP !== 0
    ) {
      throw new InvalidSettingsError(
        `Block length must be a multiple of ${BLOCK_MINUTES_STEP} minutes between ${MIN_BLOCK_MINUTES} and ${MAX_BLOCK_MINUTES}`,
      );
    }
    const settings = await requireSettings(ports, input.userId);
    return ports.settings.upsert({ ...settings, defaultBlockMinutes: input.minutes });
  };
}

// --- setWorkingHours ---------------------------------------------------------

export type SetWorkingHoursInput = { readonly userId: UserId; readonly text: string };

function regex(source: string, flags = "iu"): RegExp {
  return new RegExp(source, flags);
}

const HOUR = String.raw`([01]?\d|2[0-3])`;
const TIME = String.raw`${HOUR}(?::([0-5]\d))?`;
const TIME_RANGE_S_DO = regex(String.raw`с\s+${TIME}\s+до\s+${TIME}`);
const TIME_RANGE_DASH = regex(String.raw`${TIME}\s*[-–—]\s*${TIME}`);

const DAY_CODES: Readonly<Record<string, number>> = {
  пн: 1,
  вт: 2,
  ср: 3,
  чт: 4,
  пт: 5,
  сб: 6,
  вс: 7,
};
// `\b` is ASCII-only in JS regexes and never matches around Cyrillic letters,
// so day-word boundaries use the same negative-lookaround trick as the
// intent parser instead.
const LETTER = String.raw`\p{L}\p{N}_`;
const WORD_START = String.raw`(?<![${LETTER}])`;
const WORD_END = String.raw`(?![${LETTER}])`;
const DAY_WORD = String.raw`(?:пн|вт|ср|чт|пт|сб|вс)`;
const DAY_RANGE = regex(String.raw`${WORD_START}(${DAY_WORD})\s*[-–—]\s*(${DAY_WORD})${WORD_END}`);
const DAY_LIST = regex(String.raw`${WORD_START}(${DAY_WORD})${WORD_END}`, "giu");

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function clockTime(hour: string, minute: string | undefined): string {
  return `${pad2(Number(hour))}:${minute ?? "00"}`;
}

function dayRange(from: number, to: number): number[] {
  const days: number[] = [];
  for (let day = from; ; day = (day % 7) + 1) {
    days.push(day);
    if (day === to) break;
  }
  return days;
}

/**
 * Parses free text like `09:00–18:00 пн–пт` or `с 10 до 19` into
 * `WorkingHours`. When no day range or list is found, `currentIsoDays` is kept
 * unchanged. Throws `InvalidSettingsError` when no time range can be found;
 * the resulting hours are still checked by `normalizeSettings` on `upsert`.
 */
function parseWorkingHoursText(text: string, currentIsoDays: readonly number[]): WorkingHours {
  const normalized = text.trim();
  const sDoMatch = TIME_RANGE_S_DO.exec(normalized);
  const match = sDoMatch ?? TIME_RANGE_DASH.exec(normalized);
  if (match === null) {
    throw new InvalidSettingsError(
      "Could not find a time range: try '09:00-18:00' or 'с 10 до 19'",
    );
  }
  const start = clockTime(match[1], match[2]);
  const end = clockTime(match[3], match[4]);

  const rangeMatch = DAY_RANGE.exec(normalized);
  if (rangeMatch !== null) {
    const from = DAY_CODES[rangeMatch[1].toLowerCase()];
    const to = DAY_CODES[rangeMatch[2].toLowerCase()];
    if (from !== undefined && to !== undefined) {
      return { isoDays: dayRange(from, to), start, end };
    }
  }
  const listMatches = [...normalized.matchAll(DAY_LIST)].map((entry) => DAY_CODES[entry[0].toLowerCase()]);
  const isoDays = listMatches.length > 0 ? [...new Set(listMatches)].sort((a, b) => a - b) : [...currentIsoDays];
  return { isoDays, start, end };
}

export function createSetWorkingHours(ports: Pick<PersonalFlowPorts, "settings">) {
  return async function setWorkingHours(input: SetWorkingHoursInput): Promise<UserSettings> {
    const settings = await requireSettings(ports, input.userId);
    const workingHours = parseWorkingHoursText(input.text, settings.workingHours.isoDays);
    return ports.settings.upsert({ ...settings, workingHours });
  };
}

// --- setCalendarConnected ---------------------------------------------------

export type SetCalendarConnectedInput = { readonly userId: UserId; readonly connected: boolean };

/** v1 demo flag: no real calendar connector exists yet (ADR 0002). */
export function createSetCalendarConnected(ports: Pick<PersonalFlowPorts, "settings">) {
  return async function setCalendarConnected(input: SetCalendarConnectedInput): Promise<UserSettings> {
    const settings = await requireSettings(ports, input.userId);
    return ports.settings.upsert({ ...settings, calendarConnected: input.connected });
  };
}
