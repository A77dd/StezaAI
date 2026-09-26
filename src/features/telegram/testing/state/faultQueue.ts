import type { ResponseParameters } from "grammy/types";
import { NOT_MODIFIED_DESCRIPTION, QUERY_TOO_OLD } from "../validation/rejection";

/**
 * A failure the fake answers with instead of running a method: the Bot API
 * answering with an error, or the network failing (grammY then throws an
 * `HttpError`).
 */
export type ApiFailure =
  | {
      readonly error_code: 429;
      readonly retry_after: number;
      readonly description?: string;
    }
  | {
      readonly error_code: number;
      readonly description: string;
      readonly retry_after?: number;
      readonly migrate_to_chat_id?: number;
    };

export type NetworkFailure = {
  readonly network_error: string;
  /**
   * The request took effect on Telegram's side but the response was lost
   * ("deliver then drop"): state changes, the caller still sees an error.
   */
  readonly deliver?: boolean;
};

export type FakeFailure = ApiFailure | NetworkFailure;

export function isNetworkFailure(failure: FakeFailure): failure is NetworkFailure {
  return "network_error" in failure;
}

/** The `ok: false` body for an API failure. */
export function failureBody(failure: ApiFailure): {
  readonly error_code: number;
  readonly description: string;
  readonly parameters?: ResponseParameters;
} {
  const parameters: ResponseParameters = {
    ...(failure.retry_after === undefined ? {} : { retry_after: failure.retry_after }),
    ...("migrate_to_chat_id" in failure && failure.migrate_to_chat_id !== undefined
      ? { migrate_to_chat_id: failure.migrate_to_chat_id }
      : {}),
  };
  const description =
    failure.description ?? `Too Many Requests: retry after ${failure.retry_after ?? 0}`;
  return Object.keys(parameters).length === 0
    ? { error_code: failure.error_code, description }
    : { error_code: failure.error_code, description, parameters };
}

/** Ready made failures for the cases handlers have to survive. */
export const fakeFailures = {
  tooManyRequests: (retryAfterSeconds: number): ApiFailure => ({
    error_code: 429,
    retry_after: retryAfterSeconds,
  }),
  blockedByUser: (): ApiFailure => ({
    error_code: 403,
    description: "Forbidden: bot was blocked by the user",
  }),
  messageNotModified: (): ApiFailure => ({
    error_code: 400,
    description: NOT_MODIFIED_DESCRIPTION,
  }),
  queryTooOld: (): ApiFailure => ({
    error_code: 400,
    description: `Bad Request: ${QUERY_TOO_OLD}`,
  }),
  serverError: (): ApiFailure => ({ error_code: 502, description: "Bad Gateway" }),
  networkError: (message = "fetch failed"): NetworkFailure => ({ network_error: message }),
  /** The request went through but the response never arrived. */
  networkErrorAfterDelivery: (message = "fetch failed"): NetworkFailure => ({
    network_error: message,
    deliver: true,
  }),
} as const;

type QueuedFailure = { readonly method: string; readonly failure: FakeFailure; remaining: number };

/** Failures waiting for calls to a method, consumed in the order they were added. */
export function createFaultQueue() {
  let queue: QueuedFailure[] = [];
  return {
    add(method: string, failure: FakeFailure, times: number): void {
      if (!Number.isInteger(times) || times < 1) {
        throw new RangeError("failNext needs a positive integer number of times");
      }
      queue.push({ method, failure, remaining: times });
    },
    /** The next failure queued for `method`, consumed. */
    take(method: string): FakeFailure | undefined {
      const entry = queue.find((candidate) => candidate.method === method);
      if (entry === undefined) return undefined;
      entry.remaining -= 1;
      if (entry.remaining === 0) queue = queue.filter((candidate) => candidate !== entry);
      return entry.failure;
    },
    clear(): void {
      queue = [];
    },
  };
}

export type FaultQueue = ReturnType<typeof createFaultQueue>;
