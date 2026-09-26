import { InvalidArgumentError } from "./errors";
import { MAX_REMINDER_ATTEMPTS } from "./types";

/**
 * Wait before the next delivery attempt after the 1st, 2nd, 3rd and 4th
 * failure (exponential: 30 s, 2 min, 10 min, 1 h). The 5th failure is final.
 */
export const REMINDER_RETRY_BACKOFF_SECONDS = [30, 120, 600, 3600] as const;

/** `lastError` is capped at this many characters. */
export const MAX_REMINDER_ERROR_LENGTH = 200;

/** Milliseconds to wait after `failedAttempts` failures (1 to `MAX_REMINDER_ATTEMPTS - 1`). */
export function retryDelayMs(failedAttempts: number): number {
  const seconds = Number.isInteger(failedAttempts)
    ? REMINDER_RETRY_BACKOFF_SECONDS[failedAttempts - 1]
    : undefined;
  if (seconds === undefined) {
    throw new InvalidArgumentError(
      `A retry exists only after failure 1 to ${MAX_REMINDER_ATTEMPTS - 1}, not ${failedAttempts}`,
    );
  }
  return seconds * 1000;
}

/**
 * Makes a delivery error safe to store on a reminder: whitespace (including
 * newlines) collapsed to single spaces and the length capped. Pass API error
 * descriptions and codes only, NEVER message text or other user content: the
 * value is kept and may be logged.
 */
export function sanitizeDeliveryError(error: string): string {
  const collapsed = error.replace(/\s+/gu, " ").trim();
  if (collapsed === "") return "unknown error";
  const characters = Array.from(collapsed);
  return characters.length > MAX_REMINDER_ERROR_LENGTH
    ? `${characters.slice(0, MAX_REMINDER_ERROR_LENGTH - 1).join("")}…`
    : collapsed;
}
