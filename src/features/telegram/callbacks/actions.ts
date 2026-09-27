import { CHECK_IN_OUTCOMES, CHECK_IN_REASONS } from "../domain";
import type { CheckInOutcome, CheckInReason } from "../domain";

/**
 * Registry of button actions. Payloads live server-side (`CallbackStore`);
 * `callback_data` only carries `v1:<action>:<token>`. Each action declares who
 * may press it (`scope`), for how long (`ttlMs`), whether one press consumes it
 * (`singleUse`) and a handwritten type guard used whenever a payload is issued
 * or read back, so a corrupted store row can never reach a handler.
 */

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const MAX_ID_LENGTH = 200;
/** `settings.toggle.value` is free-ish text (for example a chosen working-hours preset); bounded like the rest. */
const MAX_TOGGLE_VALUE_LENGTH = 200;
const INTENT_KINDS = ["task", "meeting", "reminder", "follow_up", "info"] as const;
const CONTEXT_CHOICES = ["personal", "group", "remember"] as const;
const SETTINGS_KEYS = ["notification_intensity", "working_hours", "block_length", "calendar"] as const;
const DATA_DELETE_DECISIONS = ["confirm", "cancel"] as const;
/** IANA-ish charset for a timezone name; `assertValidTimezone` does the real validation. */
const TIMEZONE_PATTERN = /^[A-Za-z0-9_/+-]{1,64}$/;

export type CallbackPayloads = {
  "slot.pick": {
    readonly taskId: string;
    readonly slotIndex: 0 | 1 | 2;
    readonly slotStart: string;
    readonly slotEnd: string;
  };
  "slot.other": { readonly taskId: string };
  "calendar.month": { readonly taskId: string; readonly year: number; readonly month: number };
  "calendar.day": { readonly taskId: string; readonly year: number; readonly month: number; readonly day: number };
  "welcome.providers": Record<string, never>;
  "welcome.main": Record<string, never>;
  "welcome.connect": { readonly provider: string };
  "task.edit": { readonly taskId: string };
  "intent.choose": { readonly draftId: string; readonly kind: (typeof INTENT_KINDS)[number] };
  "context.choose": { readonly draftId: string; readonly choice: (typeof CONTEXT_CHOICES)[number] };
  "checkin.answer": { readonly checkInId: string; readonly outcome: CheckInOutcome };
  "checkin.reason": { readonly checkInId: string; readonly reason: CheckInReason };
  "settings.toggle": { readonly key: (typeof SETTINGS_KEYS)[number]; readonly value?: string };
  "settings.timezone": { readonly tz: string };
  "data.delete": { readonly decision: (typeof DATA_DELETE_DECISIONS)[number] };
  noop: Record<string, never>;
};

export type CallbackAction = keyof CallbackPayloads;
export type CallbackPayload<A extends CallbackAction> = CallbackPayloads[A];

/** `user`: only the issuing user may press. `chat`: the same user in the same chat. */
export type CallbackScope = "user" | "chat";

export type CallbackActionConfig<P> = {
  readonly singleUse: boolean;
  readonly ttlMs: number;
  readonly scope: CallbackScope;
  validate(payload: unknown): payload is P;
};

type PlainRecord = Readonly<Record<string, unknown>>;

/**
 * True only for object literals (`{}` or `Object.create(Object.prototype)`),
 * never arrays, class instances, `Date`, `Map`, or `Object.create(null)`. A
 * stored callback payload must be plain data, so a corrupted row (someone
 * else's serialized object, a class instance from a buggy migration) is
 * rejected here rather than accidentally satisfying a validator by shape.
 */
function isPlainRecord(value: unknown): value is PlainRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOnlyKeys(record: PlainRecord, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

/** No whitespace or newlines: ids are opaque tokens (`task_1`, a UUID), never free text. */
const ID_PATTERN = /^\S+$/u;

function isId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    ID_PATTERN.test(value)
  );
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function isTaskPayload(payload: unknown): payload is CallbackPayloads["slot.other"] {
  return isPlainRecord(payload) && hasOnlyKeys(payload, ["taskId"]) && isId(payload.taskId);
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function isSlotPick(payload: unknown): payload is CallbackPayloads["slot.pick"] {
  return (
    isPlainRecord(payload) &&
    hasOnlyKeys(payload, ["taskId", "slotIndex", "slotStart", "slotEnd"]) &&
    isId(payload.taskId) &&
    (payload.slotIndex === 0 || payload.slotIndex === 1 || payload.slotIndex === 2) &&
    isInstant(payload.slotStart) &&
    isInstant(payload.slotEnd)
  );
}

function isIntentChoose(payload: unknown): payload is CallbackPayloads["intent.choose"] {
  return (
    isPlainRecord(payload) &&
    hasOnlyKeys(payload, ["draftId", "kind"]) &&
    isId(payload.draftId) &&
    isOneOf(INTENT_KINDS, payload.kind)
  );
}

function isContextChoose(payload: unknown): payload is CallbackPayloads["context.choose"] {
  return (
    isPlainRecord(payload) &&
    hasOnlyKeys(payload, ["draftId", "choice"]) &&
    isId(payload.draftId) &&
    isOneOf(CONTEXT_CHOICES, payload.choice)
  );
}

function isCheckInAnswer(payload: unknown): payload is CallbackPayloads["checkin.answer"] {
  return (
    isPlainRecord(payload) &&
    hasOnlyKeys(payload, ["checkInId", "outcome"]) &&
    isId(payload.checkInId) &&
    isOneOf(CHECK_IN_OUTCOMES, payload.outcome)
  );
}

function isCheckInReason(payload: unknown): payload is CallbackPayloads["checkin.reason"] {
  return (
    isPlainRecord(payload) &&
    hasOnlyKeys(payload, ["checkInId", "reason"]) &&
    isId(payload.checkInId) &&
    isOneOf(CHECK_IN_REASONS, payload.reason)
  );
}

function isSettingsToggle(payload: unknown): payload is CallbackPayloads["settings.toggle"] {
  return (
    isPlainRecord(payload) &&
    hasOnlyKeys(payload, ["key", "value"]) &&
    isOneOf(SETTINGS_KEYS, payload.key) &&
    (payload.value === undefined ||
      (typeof payload.value === "string" && payload.value.length <= MAX_TOGGLE_VALUE_LENGTH))
  );
}

function isSettingsTimezone(payload: unknown): payload is CallbackPayloads["settings.timezone"] {
  return (
    isPlainRecord(payload) &&
    hasOnlyKeys(payload, ["tz"]) &&
    typeof payload.tz === "string" &&
    TIMEZONE_PATTERN.test(payload.tz)
  );
}

function isDataDelete(payload: unknown): payload is CallbackPayloads["data.delete"] {
  return (
    isPlainRecord(payload) && hasOnlyKeys(payload, ["decision"]) && isOneOf(DATA_DELETE_DECISIONS, payload.decision)
  );
}

function isNoop(payload: unknown): payload is CallbackPayloads["noop"] {
  return isPlainRecord(payload) && Object.keys(payload).length === 0;
}

function isEmptyPayload(payload: unknown): payload is Record<string, never> {
  return isPlainRecord(payload) && Object.keys(payload).length === 0;
}

const PROVIDER_PATTERN = /^[a-z0-9_-]{1,32}$/;

function isWelcomeConnect(payload: unknown): payload is CallbackPayloads["welcome.connect"] {
  return (
    isPlainRecord(payload) &&
    hasOnlyKeys(payload, ["provider"]) &&
    typeof payload.provider === "string" &&
    PROVIDER_PATTERN.test(payload.provider)
  );
}

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const MONTHS_PER_YEAR = 12;

function isCalendarMonth(payload: unknown): payload is CallbackPayloads["calendar.month"] {
  return (
    isPlainRecord(payload) &&
    hasOnlyKeys(payload, ["taskId", "year", "month"]) &&
    isId(payload.taskId) &&
    typeof payload.year === "number" &&
    Number.isInteger(payload.year) &&
    payload.year >= MIN_YEAR &&
    payload.year <= MAX_YEAR &&
    typeof payload.month === "number" &&
    Number.isInteger(payload.month) &&
    payload.month >= 1 &&
    payload.month <= MONTHS_PER_YEAR
  );
}

function isCalendarDay(payload: unknown): payload is CallbackPayloads["calendar.day"] {
  return (
    isPlainRecord(payload) &&
    hasOnlyKeys(payload, ["taskId", "year", "month", "day"]) &&
    isId(payload.taskId) &&
    typeof payload.year === "number" &&
    Number.isInteger(payload.year) &&
    payload.year >= MIN_YEAR &&
    payload.year <= MAX_YEAR &&
    typeof payload.month === "number" &&
    Number.isInteger(payload.month) &&
    payload.month >= 1 &&
    payload.month <= MONTHS_PER_YEAR &&
    typeof payload.day === "number" &&
    Number.isInteger(payload.day) &&
    payload.day >= 1 &&
    payload.day <= 31
  );
}

export const CALLBACK_ACTIONS = Object.freeze({
  "slot.pick": { singleUse: true, ttlMs: DAY_MS, scope: "user", validate: isSlotPick },
  "slot.other": { singleUse: true, ttlMs: DAY_MS, scope: "user", validate: isTaskPayload },
  "calendar.month": { singleUse: false, ttlMs: DAY_MS, scope: "user", validate: isCalendarMonth },
  "calendar.day": { singleUse: false, ttlMs: DAY_MS, scope: "user", validate: isCalendarDay },
  "welcome.providers": { singleUse: false, ttlMs: 30 * DAY_MS, scope: "user", validate: isEmptyPayload },
  "welcome.main": { singleUse: false, ttlMs: 30 * DAY_MS, scope: "user", validate: isEmptyPayload },
  "welcome.connect": { singleUse: false, ttlMs: 30 * DAY_MS, scope: "user", validate: isWelcomeConnect },
  "task.edit": { singleUse: false, ttlMs: DAY_MS, scope: "user", validate: isTaskPayload },
  "intent.choose": { singleUse: true, ttlMs: DAY_MS, scope: "user", validate: isIntentChoose },
  "context.choose": { singleUse: true, ttlMs: DAY_MS, scope: "chat", validate: isContextChoose },
  "checkin.answer": { singleUse: true, ttlMs: 7 * DAY_MS, scope: "user", validate: isCheckInAnswer },
  "checkin.reason": { singleUse: true, ttlMs: 7 * DAY_MS, scope: "user", validate: isCheckInReason },
  "settings.toggle": { singleUse: false, ttlMs: 30 * DAY_MS, scope: "user", validate: isSettingsToggle },
  "settings.timezone": { singleUse: false, ttlMs: 30 * DAY_MS, scope: "user", validate: isSettingsTimezone },
  "data.delete": { singleUse: true, ttlMs: 15 * MINUTE_MS, scope: "user", validate: isDataDelete },
  noop: { singleUse: false, ttlMs: 30 * DAY_MS, scope: "user", validate: isNoop },
} as const satisfies { readonly [A in CallbackAction]: CallbackActionConfig<CallbackPayload<A>> });

/** True for names registered in `CALLBACK_ACTIONS` (own keys only: `toString` is not an action). */
export function isCallbackAction(value: string): value is CallbackAction {
  return Object.hasOwn(CALLBACK_ACTIONS, value);
}
