import { GrammyError, HttpError } from "grammy";
import { TelegramLayerError } from "../domain";
import { classifyTelegramError } from "./telegramErrors";
import { redactTokens } from "./redaction";

/**
 * Thrown by the pipeline's error boundary after a failed update was logged and
 * the user was told. It is the single error the runtime sees for a failed
 * update, so the runtime (webhook inbox, polling runner) can decide whether to
 * retry. `cause` keeps the original error; the message holds only the update
 * id and a code, so it is safe to log.
 *
 * grammY wraps whatever middleware throws in a `BotError` (`.error` is this
 * error). The runtime must log `describeError(cause)`, never the raw cause:
 * a `GrammyError` carries the request payload, which contains message text.
 */
export class UpdateProcessingError extends TelegramLayerError {
  readonly updateId: number;
  /** `errorCodeOf(cause)`: what went wrong, for retry decisions and alerts. */
  readonly causeCode: string;

  constructor(input: { updateId: number; causeCode: string; cause: unknown }) {
    super(
      "update_processing_failed",
      `Update ${input.updateId} failed (${input.causeCode})`,
      { cause: input.cause },
    );
    this.updateId = input.updateId;
    this.causeCode = input.causeCode;
  }
}

/**
 * The presenter was asked to do something the update cannot support (send a
 * card in an update with no chat, answer a callback of a message update, use
 * an answer text Telegram would reject). A bug in a handler, never a runtime
 * condition: it fails loudly instead of guessing.
 */
export class PresenterError extends TelegramLayerError {
  constructor(message: string, options?: ErrorOptions) {
    super("presenter_invalid_use", message, options);
  }
}

/**
 * A stable, low-cardinality code for any error. Layer errors keep their own
 * code; Bot API errors become `telegram_<kind>`; transport errors
 * `telegram_network_error`; everything else `unexpected`. User-facing copy is
 * chosen from this code only (never from a message or a `reason`).
 */
export function errorCodeOf(error: unknown): string {
  if (error instanceof TelegramLayerError) return error.code;
  if (error instanceof HttpError) return "telegram_network_error";
  const kind = classifyTelegramError(error);
  if (kind === undefined) return "unexpected";
  return kind === "other" ? "telegram_error" : `telegram_${kind}`;
}

export type ErrorDescription = {
  readonly errorClass: string;
  readonly errorCode: string;
  readonly telegramStatus?: number;
  readonly method?: string;
  readonly detail?: string;
};

function networkDetail(error: HttpError): string | undefined {
  const cause: unknown = error.error;
  if (!(cause instanceof Error)) return undefined;
  const code = "code" in cause && typeof cause.code === "string" ? ` ${cause.code}` : "";
  return `${cause.name}${code}`;
}

/**
 * What is safe to log about an error: its class, code and, where the source
 * guarantees it holds no user content, a detail. Never the request payload
 * (message text), never the message of an unknown error (it may quote user
 * text), never a bot token (a transport error can carry the request URL).
 */
export function describeError(error: unknown): ErrorDescription {
  const errorClass = error instanceof Error ? error.constructor.name : typeof error;
  const errorCode = errorCodeOf(error);
  if (error instanceof GrammyError) {
    return {
      errorClass,
      errorCode,
      telegramStatus: error.error_code,
      method: error.method,
      detail: redactTokens(error.description),
    };
  }
  if (error instanceof HttpError) {
    const detail = networkDetail(error);
    return { errorClass, errorCode, ...(detail === undefined ? {} : { detail: redactTokens(detail) }) };
  }
  if (error instanceof TelegramLayerError) {
    return { errorClass, errorCode, detail: redactTokens(error.message) };
  }
  return { errorClass, errorCode };
}
