import { TelegramLayerError } from "../domain";

/**
 * Callback errors. `callback_data` is client-controlled, so messages are
 * static: they never echo the received data, which keeps them safe to log and
 * to show. Handlers map `code` to a visible `answerCallbackQuery` text.
 */

/** The data is not `v1:<action>:<token>` (wrong shape, charset or size). */
export class CallbackMalformedError extends TelegramLayerError {
  constructor(message = "Callback data is malformed", options?: ErrorOptions) {
    super("callback_malformed", message, options);
  }
}

/** The data carries a version other than the supported one. */
export class CallbackVersionError extends TelegramLayerError {
  constructor(message = "Callback data version is not supported", options?: ErrorOptions) {
    super("callback_unsupported_version", message, options);
  }
}

/** The action name is not in the registry. */
export class CallbackUnknownActionError extends TelegramLayerError {
  constructor(message = "Callback action is not known", options?: ErrorOptions) {
    super("callback_unknown_action", message, options);
  }
}

/** The encoded data exceeds Telegram's 64-byte limit for `callback_data`. */
export class CallbackTooLongError extends TelegramLayerError {
  constructor(message = "Callback data exceeds 64 bytes", options?: ErrorOptions) {
    super("callback_too_long", message, options);
  }
}

/** Why a callback could not be found. Only for logs, never for the client. */
export type CallbackNotFoundReason =
  | "unknown_token"
  | "action_mismatch"
  | "owner_mismatch"
  | "chat_mismatch";

/**
 * Unknown token AND ownership failure. The message and code are identical for
 * every `reason`, so a forged or foreign button is indistinguishable from a
 * missing one on the client side; `reason` exists for internal logs only.
 */
export class CallbackNotFoundError extends TelegramLayerError {
  readonly reason: CallbackNotFoundReason;

  constructor(reason: CallbackNotFoundReason, options?: ErrorOptions) {
    super("callback_not_found", "Callback not found", options);
    this.reason = reason;
  }
}

/** The token was valid but its lifetime has passed. */
export class CallbackExpiredError extends TelegramLayerError {
  constructor(message = "Callback has expired", options?: ErrorOptions) {
    super("callback_expired", message, options);
  }
}

/** A single-use token was already consumed. */
export class CallbackReplayedError extends TelegramLayerError {
  constructor(message = "Callback was already used", options?: ErrorOptions) {
    super("callback_replayed", message, options);
  }
}

/**
 * The token, owner and expiry all checked out, but the PAYLOAD stored behind
 * it fails the action's validator (a corrupted row: a bad migration, manual
 * data edit, or a bug elsewhere). Distinct from `CallbackMalformedError`,
 * which is about the client-sent `callback_data` string, not stored state.
 */
export class CallbackPayloadCorruptedError extends TelegramLayerError {
  constructor(message = "Stored callback payload is corrupted", options?: ErrorOptions) {
    super("callback_payload_corrupted", message, options);
  }
}
