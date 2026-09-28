import type {
  BlockBooking,
  BookingId,
  Draft,
  DraftId,
  Instant,
  Intent,
  Interval,
  MemoryRecord,
  NewReminder,
  PendingInput,
  Reminder,
  ReminderId,
  Slot,
  SlotSearchResult,
  SourceRef,
  StoredSlotProposal,
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
 * Returned values are independent copies: adapters never share references
 * with their internal state, so mutating a result (types are `readonly`, but
 * callers can cast) never changes what is stored.
 *
 * Ownership: callback data and inline payloads are client-controlled and can
 * be forged, so every operation that addresses a record by id also takes the
 * acting `userId`. A record owned by someone else behaves exactly like a
 * missing one (`NotFoundError`, or `null` for reads) so existence never leaks.
 */

/** Understanding: turns free text into a structured Intent. Never schedules. */
export interface IntentParser {
  parse(input: {
    text: string;
    now: Instant;
    timezone: Timezone;
    source: SourceRef;
    dateTimeHints: readonly Instant[];
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
/** One busy calendar event: the interval plus what the calendar knows about it. */
export type BusyEvent = Interval & {
  /** The event name, when the calendar returned one; external imports have none. */
  readonly title?: string;
  /** The user's own booked meeting this event came from, when it did. */
  readonly taskId?: TaskId;
};

export interface CalendarPort {
  /**
   * Busy intervals of the user that overlap `range`, sorted by start. A busy
   * event carries its name and task only when the calendar actually knows
   * them (the user's own blocks); external imports have neither.
   */
  getBusyIntervals(userId: UserId, range: Interval): Promise<BusyEvent[]>;
  /** `null` for an unknown booking or one owned by another user. */
  getBlock(userId: UserId, bookingId: BookingId): Promise<BlockBooking | null>;
  /** Throws `SlotConflictError` if the slot overlaps an existing block. */
  createBlock(input: {
    userId: UserId;
    taskId: TaskId;
    title: string;
    slot: Slot;
  }): Promise<BlockBooking>;
  /**
   * Throws `NotFoundError` for an unknown booking or one owned by another
   * user, `SlotConflictError` on overlap.
   */
  updateBlock(userId: UserId, bookingId: BookingId, slot: Slot): Promise<BlockBooking>;
  /**
   * Throws `NotFoundError` for an unknown booking, one owned by another user,
   * and on a second delete.
   */
  deleteBlock(userId: UserId, bookingId: BookingId): Promise<void>;
}

/**
 * Fields to change. A key whose value is `undefined` means "not provided" and
 * is skipped; clearing a nullable field is an explicit `null`
 * (`{ deadline: null }`), so a patch can never turn `deadline` into `undefined`.
 */
export type TaskPatch = Partial<Omit<Task, "id" | "userId" | "createdAt">>;

export interface TaskRepository {
  /** Throws `AlreadyExistsError` if the id is taken. */
  create(task: Task): Promise<Task>;
  /** `null` for an unknown task and for one owned by another user. */
  get(userId: UserId, id: TaskId): Promise<Task | null>;
  /** Throws `NotFoundError` for an unknown task or one owned by another user. */
  update(userId: UserId, id: TaskId, patch: TaskPatch): Promise<Task>;
  /**
   * Atomic compare-and-set: applies `patch` (same semantics as `update`) only
   * if the task's current status is one of `allowedFrom`, and reports the new
   * status atomically so a concurrent transition can never be lost silently.
   * Throws `NotFoundError` for an unknown task or one owned by another user
   * (checked first), then `InvalidTransitionError` when the current status is
   * not in `allowedFrom`. Of two concurrent calls racing the same task from
   * the same source status, exactly one succeeds; the other sees the status
   * the winner left behind.
   */
  transition(
    userId: UserId,
    id: TaskId,
    allowedFrom: readonly TaskStatus[],
    patch: TaskPatch,
  ): Promise<Task>;
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
 * Reminder outbox with leases and retry backoff. Delivery is at-least-once: a
 * worker claims due reminders for a lease, delivers, then calls `markSent` or
 * `markFailed`. A claimed reminder is invisible to other claims until its
 * lease expires; a worker that dies mid-delivery is retried after the lease.
 * Deliver idempotently.
 */
export interface ReminderQueue {
  /** Stores a `pending` reminder. Throws `AlreadyExistsError` if the id is taken. */
  schedule(reminder: NewReminder): Promise<Reminder>;
  /**
   * Leases up to `limit` pending reminders that are due (`dueAt <= now`),
   * past their retry time (`nextAttemptAt`) and not currently leased, ordered
   * by `dueAt` then `id`. Sets `leasedUntil = now + leaseMs` on each and
   * returns them. Throws `InvalidArgumentError` unless `limit` and `leaseMs`
   * are positive integers.
   */
  claimDue(now: Instant, limit: number, leaseMs: number): Promise<Reminder[]>;
  /** Only a `pending` reminder can be sent; otherwise `ReminderStateError`. Clears the lease. */
  markSent(id: ReminderId): Promise<Reminder>;
  /**
   * Increments `attempts`, stores `error` sanitized (`sanitizeDeliveryError`,
   * at most 200 characters; pass API error descriptions, never message text),
   * clears the lease and sets `nextAttemptAt = now + backoff`
   * (`REMINDER_RETRY_BACKOFF_SECONDS`). The reminder stays `pending` until
   * `MAX_REMINDER_ATTEMPTS` failures, then becomes `failed`. Only a `pending`
   * reminder can fail; otherwise `ReminderStateError`.
   */
  markFailed(id: ReminderId, error: string, now: Instant): Promise<Reminder>;
  /** Cancels the user's `pending` reminders; returns how many were cancelled. */
  cancelForUser(userId: UserId): Promise<number>;
  /**
   * Cancels the user's `pending` reminders for one task. Other users'
   * reminders for the same task id are untouched (returns 0 for them).
   */
  cancelForTask(userId: UserId, taskId: TaskId): Promise<number>;
  /** All of the user's reminders, in every status, ordered by `dueAt` then `id`, for `/export`. */
  exportForUser(userId: UserId): Promise<Reminder[]>;
  /**
   * Hard-deletes every reminder of the user regardless of status (used by
   * `/deleteme`). Unlike `cancelForUser` (a business cancellation that only
   * touches `pending` rows and keeps history), this erases everything.
   * Returns how many were removed.
   */
  deleteAllForUser(userId: UserId): Promise<number>;
}

export interface MemoryRepository {
  /** Throws `MemoryNotConfirmedError` unless `record.confirmedByUser` is true (also checked at runtime). */
  record(userId: UserId, record: MemoryRecord): Promise<void>;
  /** In insertion order. */
  listByUser(userId: UserId): Promise<MemoryRecord[]>;
  /** Returns how many records were removed. */
  deleteAllForUser(userId: UserId): Promise<number>;
}

/**
 * Short-lived drafts (see `Draft`). `save` is an upsert (the id always comes
 * from an `IdGenerator`, so collisions are not a normal case). Adapters own an
 * injected `Clock` and treat a draft whose `expiresAt` has passed exactly like
 * a missing one in `get`, so callers never see a stale draft as valid.
 */
export interface DraftRepository {
  save(draft: Draft): Promise<Draft>;
  /** `null` for an unknown draft, one owned by another user, or an expired one. */
  get(userId: UserId, id: DraftId): Promise<Draft | null>;
  /** Idempotent: deleting a draft that does not exist (or belongs to someone else) is a no-op. */
  delete(userId: UserId, id: DraftId): Promise<void>;
  /** Returns how many drafts were removed. */
  deleteAllForUser(userId: UserId): Promise<number>;
  /** Removes drafts whose `expiresAt <= now`. Returns how many. */
  purgeExpired(now: Instant): Promise<number>;
}

/**
 * The current slot proposal offered for a task (see `StoredSlotProposal`), one
 * per task. `save` is an upsert. Adapters own an injected `Clock` and treat an
 * expired proposal exactly like a missing one in `get`.
 */
export interface ProposalRepository {
  save(userId: UserId, proposal: StoredSlotProposal): Promise<StoredSlotProposal>;
  /** `null` for an unknown proposal, one owned by another user, or an expired one. */
  get(userId: UserId, taskId: TaskId): Promise<StoredSlotProposal | null>;
  /** Idempotent: deleting a proposal that does not exist is a no-op. */
  delete(userId: UserId, taskId: TaskId): Promise<void>;
  /** Returns how many proposals were removed. */
  deleteAllForUser(userId: UserId): Promise<number>;
  /** Removes proposals whose `expiresAt <= now`. Returns how many. */
  purgeExpired(now: Instant): Promise<number>;
}

/**
 * A pending free-text answer expected from the user after a prompt (see
 * `PendingInput`). `save` is an upsert keyed by `(userId, chatId,
 * promptMessageId)`. Adapters own an injected `Clock`.
 */
export interface PendingInputRepository {
  save(input: PendingInput): Promise<PendingInput>;
  /** Reads a matching, unexpired input without consuming it; expired inputs are removed. */
  peekByPrompt(userId: UserId, chatId: number, promptMessageId: number): Promise<PendingInput | null>;
  /**
   * Atomically reads and removes the pending input for that prompt, so an
   * answer can be applied at most once. Returns `null` when there is none, it
   * belongs to another user, or it has expired (an expired one is still
   * removed).
   */
  consumeByPrompt(userId: UserId, chatId: number, promptMessageId: number): Promise<PendingInput | null>;
  /** Returns how many pending inputs were removed. */
  deleteAllForUser(userId: UserId): Promise<number>;
}
