import type {
  BlockBooking,
  BookingId,
  Instant,
  Intent,
  Interval,
  MemoryRecord,
  NewReminder,
  Reminder,
  ReminderId,
  Slot,
  SlotSearchResult,
  SourceRef,
  Task,
  TaskId,
  TaskStatus,
  Timezone,
  UserId,
  UserSettings,
} from "./types";

/**
 * Ports of the Telegram interaction layer (ADR 0002). The domain depends only
 * on these interfaces; adapters implement them and never the other way round.
 * Every value returned by a port is a copy the caller may keep or mutate.
 */

/** Understanding: turns free text into a structured Intent. Never schedules. */
export interface IntentParser {
  parse(input: {
    text: string;
    now: Instant;
    timezone: Timezone;
    source: SourceRef;
  }): Promise<Intent>;
}

/**
 * Time: deterministic and independent of the LLM. Synchronous and pure: the
 * same input always gives the same output. Returns 0-3 slots, earliest first.
 *
 * Search horizon: without a deadline the search covers
 * `DEFAULT_SEARCH_HORIZON_DAYS` (7) days from `now`; a deadline farther away
 * is capped at `MAX_SEARCH_HORIZON_DAYS` (60) days. An empty `slots` array is
 * therefore ambiguous on its own, so the result says why the search ended:
 * `none_before_deadline` means the deadline was reached (tell the user there
 * is no time before it), `horizon_reached` means free time may exist later
 * (offer to search further). `searchedUntil` is where the search stopped.
 */
export interface SlotScheduler {
  propose(input: {
    task: Pick<Task, "id" | "deadline" | "durationMinutes" | "priority">;
    busy: readonly Interval[];
    settings: UserSettings;
    now: Instant;
  }): SlotSearchResult;
}

/** Calendar. A block is only created after explicit user confirmation. */
export interface CalendarPort {
  /** Busy intervals of the user that overlap `range`, sorted by start. */
  getBusyIntervals(userId: UserId, range: Interval): Promise<Interval[]>;
  /** Throws `SlotConflictError` if the slot overlaps an existing block. */
  createBlock(input: {
    userId: UserId;
    taskId: TaskId;
    title: string;
    slot: Slot;
  }): Promise<BlockBooking>;
  /** Throws `NotFoundError` for an unknown booking, `SlotConflictError` on overlap. */
  updateBlock(bookingId: BookingId, slot: Slot): Promise<BlockBooking>;
  /** Throws `NotFoundError` for an unknown booking (also on a second delete). */
  deleteBlock(bookingId: BookingId): Promise<void>;
}

export type TaskPatch = Partial<Omit<Task, "id" | "userId" | "createdAt">>;

export interface TaskRepository {
  /** Throws `AlreadyExistsError` if the id is taken. */
  create(task: Task): Promise<Task>;
  get(id: TaskId): Promise<Task | null>;
  /** Throws `NotFoundError` for an unknown task. */
  update(id: TaskId, patch: TaskPatch): Promise<Task>;
  /** Ordered by `createdAt`, then `id`. */
  listByUser(userId: UserId, filter?: { status?: TaskStatus }): Promise<Task[]>;
  /** Returns how many tasks were removed. */
  deleteAllForUser(userId: UserId): Promise<number>;
  /** All of the user's tasks, in the `listByUser` order, for `/export`. */
  exportForUser(userId: UserId): Promise<Task[]>;
}

export interface SettingsRepository {
  /**
   * `null` when the user has no stored settings. Defaults are never applied
   * here; callers use `createDefaultSettings` explicitly.
   */
  get(userId: UserId): Promise<UserSettings | null>;
  /** Validates (`assertValidSettings`) and stores the settings. */
  upsert(settings: UserSettings): Promise<UserSettings>;
  /** Idempotent: deleting settings that do not exist is not an error. */
  delete(userId: UserId): Promise<void>;
}

export interface TranscriptionPort {
  /** Throws `TranscriptionUnavailableError` when speech-to-text cannot be used. */
  transcribe(input: {
    audio: Uint8Array;
    mimeType: string;
    languageHint?: string;
  }): Promise<{ text: string }>;
}

export interface Clock {
  now(): Instant;
}

export interface IdGenerator {
  /** Returns a new id like `task_1`; `prefix` is lowercase letters, digits and `_`. */
  next(prefix: string): string;
}

/**
 * Reminder outbox. Delivery is at-least-once: `claimDue` does not lock or
 * mark anything, so a worker must deliver idempotently and then call
 * `markSent` or `markFailed`.
 */
export interface ReminderQueue {
  /** Stores a `pending` reminder. Throws `AlreadyExistsError` if the id is taken. */
  schedule(reminder: NewReminder): Promise<Reminder>;
  /** Pending reminders with `dueAt <= now`, ordered by `dueAt` then `id`, at most `limit`. */
  claimDue(now: Instant, limit: number): Promise<Reminder[]>;
  /** Only a `pending` reminder can be sent; otherwise `ReminderStateError`. */
  markSent(id: ReminderId): Promise<Reminder>;
  /**
   * Increments `attempts` and stores `error`. The reminder returns to
   * `pending` until `MAX_REMINDER_ATTEMPTS` failures, then becomes `failed`.
   * Only a `pending` reminder can fail; otherwise `ReminderStateError`.
   */
  markFailed(id: ReminderId, error: string): Promise<Reminder>;
  /** Cancels the user's `pending` reminders; returns how many were cancelled. */
  cancelForUser(userId: UserId): Promise<number>;
}

export interface MemoryRepository {
  /** Throws `MemoryNotConfirmedError` unless `record.confirmedByUser` is true. */
  record(userId: UserId, record: MemoryRecord): Promise<void>;
  /** In insertion order. */
  listByUser(userId: UserId): Promise<MemoryRecord[]>;
  /** Returns how many records were removed. */
  deleteAllForUser(userId: UserId): Promise<number>;
}
