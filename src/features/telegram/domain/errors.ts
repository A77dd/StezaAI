import type { TaskStatus } from "./types";

/**
 * Typed errors of the Telegram interaction layer. Every error carries a
 * stable `code` so handlers can map it to user-facing copy without matching on
 * message text. Messages describe the rule that was broken and never embed
 * user message text, so they are safe to log.
 */
export class TelegramLayerError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

/** A proposed calendar block overlaps an existing block. */
export class SlotConflictError extends TelegramLayerError {
  constructor(message: string, options?: ErrorOptions) {
    super("slot_conflict", message, options);
  }
}

/** A referenced entity (task, booking, reminder) does not exist. */
export class NotFoundError extends TelegramLayerError {
  constructor(message: string, options?: ErrorOptions) {
    super("not_found", message, options);
  }
}

/** An entity with the same id is already stored. */
export class AlreadyExistsError extends TelegramLayerError {
  constructor(message: string, options?: ErrorOptions) {
    super("already_exists", message, options);
  }
}

/** Speech-to-text is not configured or failed; the caller must tell the user. */
export class TranscriptionUnavailableError extends TelegramLayerError {
  constructor(message: string, options?: ErrorOptions) {
    super("transcription_unavailable", message, options);
  }
}

/** The value is not a known IANA timezone identifier. */
export class InvalidTimezoneError extends TelegramLayerError {
  constructor(message: string, options?: ErrorOptions) {
    super("invalid_timezone", message, options);
  }
}

/** The text or structured intent cannot be used (empty text, bad duration...). */
export class InvalidIntentError extends TelegramLayerError {
  constructor(message: string, options?: ErrorOptions) {
    super("invalid_intent", message, options);
  }
}

/** An instant, interval or clock time is malformed. */
export class InvalidTimeError extends TelegramLayerError {
  constructor(message: string, options?: ErrorOptions) {
    super("invalid_time", message, options);
  }
}

/** User settings violate an invariant (working hours, block length...). */
export class InvalidSettingsError extends TelegramLayerError {
  constructor(message: string, options?: ErrorOptions) {
    super("invalid_settings", message, options);
  }
}

/** A reminder transition is not allowed from its current status. */
export class ReminderStateError extends TelegramLayerError {
  constructor(message: string, options?: ErrorOptions) {
    super("reminder_state", message, options);
  }
}

/** Inferred memory must be confirmed by the user before durable storage. */
export class MemoryNotConfirmedError extends TelegramLayerError {
  constructor(message: string, options?: ErrorOptions) {
    super("memory_not_confirmed", message, options);
  }
}

/** A programmer-supplied argument is out of range (limits, lease lengths, prefixes). */
export class InvalidArgumentError extends TelegramLayerError {
  constructor(message: string, options?: ErrorOptions) {
    super("invalid_argument", message, options);
  }
}

/** The intent parser (LLM provider) cannot be used right now; the caller must tell the user. */
export class IntentParserUnavailableError extends TelegramLayerError {
  constructor(message: string, options?: ErrorOptions) {
    super("intent_parser_unavailable", message, options);
  }
}

/**
 * `TaskRepository.transition` was asked to move a task out of a status it is
 * not currently in (a compare-and-set failure). Carries the task's actual
 * `currentStatus` for the caller to react to, never any user text.
 */
export class InvalidTransitionError extends TelegramLayerError {
  readonly currentStatus: TaskStatus;

  constructor(currentStatus: TaskStatus, options?: ErrorOptions) {
    super("invalid_transition", `Task is ${currentStatus}, not an allowed source status`, options);
    this.currentStatus = currentStatus;
  }
}
