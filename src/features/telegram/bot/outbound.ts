import { HttpError } from "grammy";
import type { Transformer } from "grammy";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { boundedRetry } from "./boundedRetry";
import type { BoundedRetryOptions, Sleep } from "./boundedRetry";
import { redactTokens } from "./redaction";

/** Waits with a real timer; the production `Sleep`. Aborting rejects, so a cancelled request stops waiting. */
export const realSleep: Sleep = (milliseconds, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new Error("Request aborted while waiting between retries"));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error("Request aborted while waiting between retries"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

function redactedCopy(cause: Error): Error {
  const copy = new Error(redactTokens(cause.message));
  copy.name = cause.name;
  if (cause.stack !== undefined) copy.stack = redactTokens(cause.stack);
  if ("code" in cause) Object.assign(copy, { code: cause.code });
  return copy;
}

/**
 * Removes the bot token from transport errors. When a request fails at the
 * network level, the underlying error's message and stack usually contain the
 * request URL, and the URL contains the token (`/bot<token>/method`). The
 * `HttpError` grammY throws keeps that error as `.error`, so a log line or a
 * crash report that prints the cause would leak the token. This maps every
 * `HttpError` to an equivalent one whose cause is redacted; other errors pass
 * through unchanged. Install it OUTERMOST, so everything that leaves the API
 * layer is clean.
 *
 * (A `GrammyError` holds no token but does hold the request payload, i.e.
 * message text; that is why logs use `describeError` and never print causes.)
 */
export function redactTransportErrors(): Transformer {
  return async (prev, method, payload, signal) => {
    try {
      return await prev(method, payload, signal);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      const cause: unknown = error.error;
      const clean = new HttpError(
        redactTokens(error.message),
        cause instanceof Error ? redactedCopy(cause) : cause,
      );
      if (error.stack !== undefined) clean.stack = redactTokens(error.stack);
      throw clean;
    }
  };
}

export type OutboundPolicy = {
  readonly retry: BoundedRetryOptions;
  /**
   * `apiThrottler` limits: 30 requests/s overall, 1/s per private chat, 20/min
   * per group (Telegram's flood limits). Pass `false` to switch it off. The
   * throttler waits with real timers (Bottleneck), so tests that send several
   * messages to one chat turn it off instead of waiting seconds; production
   * leaves the default. A ready transformer can be passed to replace it.
   */
  readonly throttle?: false | Transformer;
};

/** The part of a bot the policy needs: somewhere to install transformers. */
export type TransformerHost = {
  readonly api: { readonly config: { use(...transformers: Transformer[]): unknown } };
};

/**
 * Installs the outbound policy. grammY runs the transformer installed LAST
 * first, so the order installed here is, from the network outwards:
 * `boundedRetry` (retries stay next to the network and are not throttled
 * again; a 429 already waited `retry_after`), then the throttler, then the
 * token redaction. The Bot API client (or a test's fake) must already be
 * installed, before this.
 *
 * The throttler is in-memory per process: several instances do not share the
 * limit (research 4.7). It only counts calls that carry a `chat_id`.
 */
export function installOutboundPolicy(host: TransformerHost, policy: OutboundPolicy): void {
  host.api.config.use(boundedRetry(policy.retry));
  const { throttle } = policy;
  if (throttle !== false) host.api.config.use(throttle ?? apiThrottler());
  host.api.config.use(redactTransportErrors());
}
