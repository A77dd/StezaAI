/**
 * Domain vocabulary of the Telegram interaction layer. Framework-free: nothing
 * here may import grammY or Bot API types (ADR 0002).
 *
 * Conventions:
 * - `Instant` is an ISO-8601 UTC string; user-local logic uses the user's
 *   stored IANA timezone.
 * - Telegram ids that the Bot API models as numbers (`chatId`, `messageId`)
 *   stay `number`; our own ids are opaque strings.
 */

export type Instant = string;

/** Half-open time range `[start, end)`. */
export type Interval = {
  readonly start: Instant;
  readonly end: Instant;
};

export type UserId = string;
export type TaskId = string;
export type BookingId = string;
export type ReminderId = string;
export type MemoryRecordId = string;
/** IANA timezone identifier, for example `Europe/Moscow`. */
export type Timezone = string;

// --- Intent ---------------------------------------------------------------

export const INTENT_KINDS = ["task", "meeting", "reminder", "follow_up", "info"] as const;
export type IntentKind = (typeof INTENT_KINDS)[number];

export const PRIORITIES = ["low", "normal", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** The only thing the language model (or its stand-in) produces. */
export type Intent = {
  readonly kind: IntentKind;
  readonly title: string;
  readonly deadline: Instant | null;
  readonly durationMinutes: number | null;
  readonly priority: Priority;
  readonly participants: readonly string[];
  /** 0..1, how sure the parser is about `kind` and the extracted fields. */
  readonly confidence: number;
};

// --- Source ---------------------------------------------------------------

export const SOURCE_TYPES = [
  "direct_message",
  "forwarded_message",
  "group_message",
  "inline_action",
  "mini_app",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** Where a task came from. `hiddenOrigin` is explicit for privacy-hidden forwards. */
export type SourceRef = {
  readonly sourceType: SourceType;
  readonly sourceChatId: number | null;
  readonly sourceMessageId: number | null;
  readonly sourceText: string;
  readonly sourceAuthor: string | null;
  readonly sourceTimestamp: Instant | null;
  readonly hiddenOrigin: boolean;
};

// --- Tasks and scheduling ---------------------------------------------------

export const TASK_STATUSES = ["inbox", "proposed", "scheduled", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type Task = {
  readonly id: TaskId;
  readonly userId: UserId;
  readonly title: string;
  readonly kind: IntentKind;
  readonly deadline: Instant | null;
  readonly durationMinutes: number | null;
  readonly priority: Priority;
  readonly source: SourceRef;
  readonly status: TaskStatus;
  readonly createdAt: Instant;
  readonly bookingId: BookingId | null;
};

export type Slot = Interval;

/** Without a deadline the scheduler searches this many days ahead of `now`. */
export const DEFAULT_SEARCH_HORIZON_DAYS = 7;
/** Upper bound of the search, also for a distant deadline. */
export const MAX_SEARCH_HORIZON_DAYS = 60;

/**
 * Why a slot search returned what it did:
 * - `found`: at least one slot was found;
 * - `none_before_deadline`: the search reached the task's deadline with no free slot;
 * - `horizon_reached`: the search stopped at the horizon (no deadline, or a
 *   deadline farther away than the horizon), so free time may exist later.
 */
export type SlotSearchExhaustion = "found" | "none_before_deadline" | "horizon_reached";

export type SlotSearchResult = {
  /** 0-3 slots, earliest first. */
  readonly slots: Slot[];
  /** End of the searched range: the deadline or the horizon, whichever came first. */
  readonly searchedUntil: Instant;
  readonly exhausted: SlotSearchExhaustion;
};

export type SlotProposal = {
  readonly taskId: TaskId;
  /** 0-3 slots, earliest first. */
  readonly slots: readonly Slot[];
};

export type BlockBooking = {
  readonly id: BookingId;
  readonly taskId: TaskId;
  readonly userId: UserId;
  readonly slot: Slot;
  readonly calendarEventId: string;
};

// --- Settings -------------------------------------------------------------

export const LOCALES = ["ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const NOTIFICATION_INTENSITIES = ["low", "normal", "high"] as const;
export type NotificationIntensity = (typeof NOTIFICATION_INTENSITIES)[number];

export type WorkingHours = {
  /** ISO weekdays: 1 = Monday ... 7 = Sunday. */
  readonly isoDays: readonly number[];
  /** Local `HH:MM`, inclusive. */
  readonly start: string;
  /** Local `HH:MM`, exclusive; must be after `start` on the same day. */
  readonly end: string;
};

export type UserSettings = {
  readonly userId: UserId;
  /** The Bot API does not expose a timezone, so it is stored explicitly. */
  readonly timezone: Timezone;
  readonly locale: Locale;
  readonly workingHours: WorkingHours;
  readonly defaultBlockMinutes: number;
  readonly notificationIntensity: NotificationIntensity;
  readonly calendarConnected: boolean;
};

// --- Chat context -----------------------------------------------------------

export const CHAT_CONTEXTS = ["PERSONAL", "CHAT"] as const;
export type ChatContext = (typeof CHAT_CONTEXTS)[number];

// --- Check-ins --------------------------------------------------------------

export const CHECK_IN_OUTCOMES = ["done", "needs_time", "not_started", "blocked"] as const;
export type CheckInOutcome = (typeof CHECK_IN_OUTCOMES)[number];

export const CHECK_IN_REASONS = [
  "not_enough_time",
  "task_too_big",
  "unclear_start",
  "more_important",
  "postponed",
] as const;
export type CheckInReason = (typeof CHECK_IN_REASONS)[number];

export type CheckInFollowUp = "reschedule" | "split" | "reprioritize";

const FOLLOW_UP_BY_REASON: Readonly<Record<CheckInReason, CheckInFollowUp>> = {
  not_enough_time: "reschedule",
  task_too_big: "split",
  unclear_start: "split",
  more_important: "reprioritize",
  postponed: "reschedule",
};

/** Which follow-up flow a check-in reason leads to. */
export function followUpForReason(reason: CheckInReason): CheckInFollowUp {
  return FOLLOW_UP_BY_REASON[reason];
}

/** A scheduled check-in ("Как прошло?") for a booked block and the user's answer. */
export type CheckIn = {
  readonly id: string;
  readonly taskId: TaskId;
  readonly userId: UserId;
  readonly bookingId: BookingId;
  readonly askedAt: Instant;
  readonly outcome: CheckInOutcome | null;
  readonly reason: CheckInReason | null;
  readonly answeredAt: Instant | null;
};

// --- Memory -----------------------------------------------------------------

type MemoryRecordBase = {
  readonly id: MemoryRecordId;
  readonly recordedAt: Instant;
  /**
   * AGENTS.md: a meaningful inferred memory item needs user confirmation
   * before durable storage. Repositories reject records where this is false.
   */
  readonly confirmedByUser: boolean;
};

/** Typed memory records; one variant per product-doc memory field. */
export type MemoryRecord = MemoryRecordBase &
  (
    | { readonly kind: "working_hours"; readonly workingHours: WorkingHours }
    | { readonly kind: "preferred_block_length"; readonly minutes: number }
    | { readonly kind: "task_duration_estimate"; readonly taskId: TaskId; readonly minutes: number }
    | { readonly kind: "actual_duration"; readonly taskId: TaskId; readonly minutes: number }
    | { readonly kind: "reschedule_count"; readonly taskId: TaskId; readonly count: number }
    | { readonly kind: "failure_reason"; readonly taskId: TaskId; readonly reason: CheckInReason }
    | {
        readonly kind: "notification_response";
        readonly reminderId: ReminderId;
        readonly response: CheckInOutcome | "no_response";
      }
  );

export type MemoryKind = MemoryRecord["kind"];

// --- Reminders --------------------------------------------------------------

export const REMINDER_KINDS = ["block_start", "check_in"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_STATUSES = ["pending", "sent", "failed", "cancelled"] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

/** After this many failed deliveries a reminder becomes `failed` for good. */
export const MAX_REMINDER_ATTEMPTS = 5;

export type Reminder = {
  readonly id: ReminderId;
  readonly userId: UserId;
  readonly chatId: number;
  readonly taskId: TaskId;
  readonly kind: ReminderKind;
  readonly dueAt: Instant;
  readonly status: ReminderStatus;
  readonly attempts: number;
  /** Last delivery error message; never message text or user content. */
  readonly lastError: string | null;
};

/** What callers provide to schedule a reminder; the queue owns the rest. */
export type NewReminder = Omit<Reminder, "status" | "attempts" | "lastError">;
