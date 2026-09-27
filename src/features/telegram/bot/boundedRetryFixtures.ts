import { HttpError } from "grammy";
import type { Transformer } from "grammy";
import type { ApiResponse } from "grammy/types";
import { boundedRetry } from "./boundedRetry";

/**
 * Shared scaffolding for `boundedRetry.*.test.ts`: a scripted fake "network"
 * (each call takes the next step, without any real transport) and a couple of
 * response builders. Kept out of the test files so each one stays focused on
 * one group of scenarios.
 */

export type Step = ApiResponse<true> | Error;

export const OK: ApiResponse<true> = { ok: true, result: true };

export const tooMany = (seconds: number): ApiResponse<true> => ({
  ok: false,
  error_code: 429,
  description: "Too Many Requests",
  parameters: { retry_after: seconds },
});

export const failure = (code: number): ApiResponse<true> => ({
  ok: false,
  error_code: code,
  description: "x",
});

/** A network error whose cause carries `code` (Node's socket error shape), nested or not. */
export function networkError(code?: string, nested = true): HttpError {
  const socket = Object.assign(new Error("socket"), code === undefined ? {} : { code });
  const cause = nested ? new TypeError("fetch failed", { cause: socket }) : socket;
  return new HttpError("Network request failed!", cause);
}

/** Each call takes the next `step`; running out of script is a test bug, not a retry outcome. */
function scripted(steps: readonly Step[]) {
  const calls: string[] = [];
  const prev: Parameters<Transformer>[0] = async (method) => {
    calls.push(method);
    const step = steps[calls.length - 1];
    if (step === undefined) throw new Error("script exhausted");
    if (step instanceof Error) throw step;
    return step as never;
  };
  return { prev, calls };
}

/** Builds a `boundedRetry` transformer over a scripted network, with sleeps and retries recorded. */
export function setup(steps: readonly Step[], options: Partial<Parameters<typeof boundedRetry>[0]> = {}) {
  const sleeps: number[] = [];
  const retries: unknown[] = [];
  const transformer = boundedRetry({
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    onRetry: (info) => retries.push(info),
    ...options,
  });
  const { prev, calls } = scripted(steps);
  const run = (method: string, signal?: Parameters<Transformer>[3]) =>
    transformer(prev, method as never, {} as never, signal);
  return { run, calls, sleeps, retries };
}
