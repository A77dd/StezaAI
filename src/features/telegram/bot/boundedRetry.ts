import { HttpError } from "grammy";
import type { Transformer } from "grammy";
import { InvalidArgumentError } from "../domain";

/**
 * Bounded retry for outbound Bot API calls, written instead of configuring
 * `@grammyjs/auto-retry`, because that plugin (2.0.2) does not fit here. What
 * it does, read from its source:
 * - by default `maxRetryAttempts` and `maxDelaySeconds` are `Infinity`;
 * - it retries a thrown `HttpError` (a network failure) for EVERY method, and
 *   those retries are not counted against `maxRetryAttempts`. After a
 *   connection reset the request may already have been delivered, so a retried
 *   `sendMessage` posts the message twice;
 * - it retries every 5xx for every method, again including sends;
 * - it waits with a real `setTimeout` that cannot be injected, so tests would
 *   need real time.
 * This transformer keeps what is valuable (honour `retry_after`, back off on
 * server errors) and makes the rest explicit.
 *
 * What is retried:
 * - 429 with `retry_after`, for EVERY method: flood control rejects the
 *   request before processing, so nothing was sent and a retry cannot
 *   duplicate. A `retry_after` above `maxDelaySeconds` is not waited for: the
 *   failure surfaces to the caller.
 * - 5xx and network failures (`HttpError`) only for idempotent methods
 *   (`IDEMPOTENT_METHODS`): repeating an edit, an answer or a read is
 *   harmless even if the first attempt got through. For a send an ambiguous
 *   failure is NOT retried: the caller sees the error and decides (a duplicate
 *   message is worse than a visible failure).
 * - The one exception for sends: a network failure where the request provably
 *   never left this machine (`REQUEST_NOT_SENT_CODES`: DNS failure, refused or
 *   unreachable connection) is safe to retry for any method.
 * All retries share one budget of `maxRetries`.
 */

/** grammY types the abort signal of a request with its own `AbortSignal` shim. */
type RequestSignal = Parameters<Transformer>[3];

export type Sleep = (milliseconds: number, signal?: RequestSignal) => Promise<void>;

export type RetryReason = "rate_limited" | "server_error" | "network_error";

export type BoundedRetryOptions = {
  /** How to wait. Injected so tests never use real timers. */
  readonly sleep: Sleep;
  /** Retries per call, after the first attempt. Default 3. */
  readonly maxRetries?: number;
  /** Longest wait honoured, in seconds; also caps the backoff. Default 30. */
  readonly maxDelaySeconds?: number;
  /** Called before each wait, for logging (method and reason only, never the payload). */
  readonly onRetry?: (info: {
    readonly method: string;
    readonly attempt: number;
    readonly delayMs: number;
    readonly reason: RetryReason;
  }) => void;
};

export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_MAX_DELAY_SECONDS = 30;
const BACKOFF_BASE_SECONDS = 1;

const IDEMPOTENT_PREFIXES = ["get", "set", "edit", "delete", "answer"] as const;
/**
 * Methods that are safe to repeat: reads (`get*`), settings (`set*`), edits,
 * deletes and answers, plus chat actions and streamed drafts, which a newer
 * call simply replaces. `send*` methods that create a message are not here.
 */
export function isIdempotentMethod(method: string): boolean {
  return (
    IDEMPOTENT_PREFIXES.some((prefix) => method.startsWith(prefix)) ||
    method === "sendChatAction" ||
    method === "sendMessageDraft" ||
    method === "sendRichMessageDraft"
  );
}

/** Socket-level error codes that mean the request never reached Telegram. */
const REQUEST_NOT_SENT_CODES: ReadonlySet<string> = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ENETDOWN",
]);

/** Node's `fetch` reports a socket error as `TypeError("fetch failed")` with the system error as `cause`. */
function isRequestNotSent(error: HttpError): boolean {
  const cause: unknown = error.error;
  const inner = cause instanceof Error ? cause.cause : undefined;
  for (const candidate of [cause, inner]) {
    if (candidate instanceof Error && "code" in candidate && typeof candidate.code === "string") {
      if (REQUEST_NOT_SENT_CODES.has(candidate.code)) return true;
    }
  }
  return false;
}

type Attempt =
  | { readonly kind: "response"; readonly response: Awaited<ReturnType<ReturnType<Transformer>>> }
  | { readonly kind: "network_error"; readonly error: HttpError };

/** What to do after a failed attempt: wait and retry, or give up (undefined). */
type RetryDecision = { readonly reason: RetryReason; readonly delaySeconds: number } | undefined;

function decide(
  method: string,
  attempt: Attempt,
  retriesDone: number,
  maxDelaySeconds: number,
): RetryDecision {
  const backoff = Math.min(maxDelaySeconds, BACKOFF_BASE_SECONDS * 2 ** retriesDone);
  if (attempt.kind === "network_error") {
    return isIdempotentMethod(method) || isRequestNotSent(attempt.error)
      ? { reason: "network_error", delaySeconds: backoff }
      : undefined;
  }
  const { response } = attempt;
  if (response.ok) return undefined;
  const retryAfter = response.parameters?.retry_after;
  if (retryAfter !== undefined) {
    // Telegram's own value; clamped defensively so a malformed or negative
    // one can never turn into a negative `setTimeout` delay.
    const delaySeconds = Math.max(0, retryAfter);
    return delaySeconds <= maxDelaySeconds ? { reason: "rate_limited", delaySeconds } : undefined;
  }
  if (response.error_code >= 500 && isIdempotentMethod(method)) {
    return { reason: "server_error", delaySeconds: backoff };
  }
  return undefined;
}

/**
 * Transformer implementing the policy above. Install it closest to the
 * network (right after the client), so every retry passes through the
 * transformers installed later.
 */
export function boundedRetry(options: BoundedRetryOptions): Transformer {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const maxDelaySeconds = options.maxDelaySeconds ?? DEFAULT_MAX_DELAY_SECONDS;
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new InvalidArgumentError("maxRetries must be a non-negative integer");
  }
  if (!(maxDelaySeconds > 0)) {
    throw new InvalidArgumentError("maxDelaySeconds must be positive");
  }

  return async (prev, method, payload, signal) => {
    for (let retriesDone = 0; ; retriesDone += 1) {
      let attempt: Attempt;
      try {
        attempt = { kind: "response", response: await prev(method, payload, signal) };
      } catch (error) {
        // Only network failures are candidates for a retry; anything else is a bug and propagates.
        if (!(error instanceof HttpError)) throw error;
        attempt = { kind: "network_error", error };
      }

      const decision =
        retriesDone < maxRetries && signal?.aborted !== true
          ? decide(method, attempt, retriesDone, maxDelaySeconds)
          : undefined;
      if (decision === undefined) {
        if (attempt.kind === "network_error") throw attempt.error;
        return attempt.response;
      }

      const delayMs = Math.round(decision.delaySeconds * 1000);
      options.onRetry?.({ method, attempt: retriesDone + 1, delayMs, reason: decision.reason });
      await options.sleep(delayMs, signal);
    }
  };
}
