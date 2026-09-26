import { GrammyError } from "grammy";

/**
 * What a failed Bot API call means for the bot. The reference does not list
 * error texts and warns that `error_code` may change, so the kind is derived
 * from `parameters` and the description first and from the code last
 * (research 7.2). The descriptions matched below were observed on the live
 * API and are also what the fake Bot API answers.
 */
export type TelegramErrorKind =
  /** 429: flood control. `parameters.retry_after` says when to come back. */
  | "rate_limited"
  /** 403: the bot may not write here (blocked by the user, kicked, deactivated). */
  | "forbidden"
  /** The edit changed nothing. Harmless: the message already looks as wanted. */
  | "message_not_modified"
  /** The callback query was already answered or its window closed. Cannot be fixed by retrying. */
  | "query_too_old"
  /** The group became a supergroup; `parameters.migrate_to_chat_id` is the new id. */
  | "chat_migrated"
  /** 5xx from Telegram. */
  | "server_error"
  /** Any other 400: a request the bot should not have made. */
  | "bad_request"
  | "other";

const NOT_MODIFIED = /message is not modified/i;
const QUERY_TOO_OLD = /query is too old|query id is invalid/i;

/** The kind of a Bot API error, or `undefined` when `error` is not one (network errors, bugs). */
export function classifyTelegramError(error: unknown): TelegramErrorKind | undefined {
  if (!(error instanceof GrammyError)) return undefined;
  const { error_code: status, description, parameters } = error;
  if (parameters.retry_after !== undefined) return "rate_limited";
  if (parameters.migrate_to_chat_id !== undefined) return "chat_migrated";
  if (NOT_MODIFIED.test(description)) return "message_not_modified";
  if (QUERY_TOO_OLD.test(description)) return "query_too_old";
  if (status === 403) return "forbidden";
  if (status >= 500) return "server_error";
  if (status === 400) return "bad_request";
  return "other";
}
