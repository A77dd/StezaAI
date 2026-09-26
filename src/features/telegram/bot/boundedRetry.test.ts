import { HttpError } from "grammy";
import type { Transformer } from "grammy";
import type { ApiResponse } from "grammy/types";
import { describe, expect, it } from "vitest";
import { boundedRetry, isIdempotentMethod } from "./boundedRetry";

type Step = ApiResponse<true> | Error;

const OK: ApiResponse<true> = { ok: true, result: true };
const tooMany = (seconds: number): ApiResponse<true> => ({
  ok: false,
  error_code: 429,
  description: "Too Many Requests",
  parameters: { retry_after: seconds },
});
const failure = (code: number): ApiResponse<true> => ({ ok: false, error_code: code, description: "x" });

/** A scripted "network": each call takes the next step; running out of script is a test bug. */
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

function setup(steps: readonly Step[], options: Partial<Parameters<typeof boundedRetry>[0]> = {}) {
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
  const run = (method: string, signal?: Parameters<Transformer>[3]) => transformer(prev, method as never, {} as never, signal);
  return { run, calls, sleeps, retries };
}

function networkError(code?: string, nested = true): HttpError {
  const socket = Object.assign(new Error("socket"), code === undefined ? {} : { code });
  const cause = nested ? new TypeError("fetch failed", { cause: socket }) : socket;
  return new HttpError("Network request failed!", cause);
}

describe("boundedRetry: rate limits (429)", () => {
  it.each(["sendMessage", "sendRichMessage", "sendDocument", "editMessageText", "answerCallbackQuery"])(
    "waits retry_after and retries %s (flood control rejects before processing)",
    async (method) => {
      const { run, calls, sleeps } = setup([tooMany(3), OK]);

      const response = await run(method);

      expect(response).toEqual(OK);
      expect(calls).toEqual([method, method]);
      expect(sleeps).toEqual([3000]);
    },
  );

  it("does not wait for a retry_after above the limit and returns the failure", async () => {
    const { run, calls, sleeps } = setup([tooMany(31)]);

    const response = await run("sendMessage");

    expect(response).toMatchObject({ ok: false, error_code: 429 });
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it("honours a custom maxDelaySeconds", async () => {
    const { run, sleeps } = setup([tooMany(60), OK], { maxDelaySeconds: 90 });

    await run("sendMessage");

    expect(sleeps).toEqual([60_000]);
  });

  it("stops after maxRetries and returns the last failure (bounded, unlike unbounded auto-retry)", async () => {
    const { run, calls, sleeps } = setup([tooMany(1), tooMany(2), tooMany(3), tooMany(4), OK]);

    const response = await run("sendMessage");

    expect(response).toMatchObject({ ok: false, parameters: { retry_after: 4 } });
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([1000, 2000, 3000]);
  });

  it("honours maxRetries: 0 (never retry)", async () => {
    const { run, calls } = setup([tooMany(1), OK], { maxRetries: 0 });

    await run("sendMessage");

    expect(calls).toHaveLength(1);
  });
});

describe("boundedRetry: server errors (5xx)", () => {
  it("retries an idempotent method with exponential backoff, capped", async () => {
    const { run, sleeps } = setup([failure(502), failure(503), failure(500), OK], { maxDelaySeconds: 3 });

    await run("editMessageText");

    expect(sleeps).toEqual([1000, 2000, 3000]);
  });

  it.each(["sendMessage", "sendRichMessage", "sendDocument", "forwardMessage"])(
    "does not retry %s: the request may have been processed",
    async (method) => {
      const { run, calls } = setup([failure(502), OK]);

      const response = await run(method);

      expect(response).toMatchObject({ ok: false, error_code: 502 });
      expect(calls).toHaveLength(1);
    },
  );

  it("does not retry client errors", async () => {
    const { run, calls } = setup([failure(400), OK]);

    await run("editMessageText");

    expect(calls).toHaveLength(1);
  });
});

describe("boundedRetry: network failures", () => {
  it("retries an idempotent method", async () => {
    const { run, calls, sleeps } = setup([networkError("ECONNRESET"), OK]);

    const response = await run("answerCallbackQuery");

    expect(response).toEqual(OK);
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([1000]);
  });

  it.each(["sendMessage", "sendRichMessage", "sendDocument"])(
    "does not retry %s after an ambiguous failure and rethrows it",
    async (method) => {
      const error = networkError("ECONNRESET");
      const { run, calls } = setup([error, OK]);

      await expect(run(method)).rejects.toBe(error);
      expect(calls).toHaveLength(1);
    },
  );

  it("does not retry a send after a failure without any error code either", async () => {
    const { run, calls } = setup([networkError(undefined), OK]);

    await expect(run("sendMessage")).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(1);
  });

  it.each(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "ENETDOWN"])(
    "retries a send when the request provably never left (%s)",
    async (code) => {
      const { run, calls } = setup([networkError(code), OK]);

      await run("sendMessage");

      expect(calls).toHaveLength(2);
    },
  );

  it("finds the code on the cause itself as well as on its cause", async () => {
    const { run, calls } = setup([networkError("ECONNREFUSED", false), OK]);

    await run("sendMessage");

    expect(calls).toHaveLength(2);
  });

  it("is bounded for network failures too", async () => {
    const errors = [1, 2, 3, 4, 5].map(() => networkError("ECONNRESET"));
    const { run, calls } = setup(errors);

    await expect(run("getFile")).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(4);
  });

  it("does not retry errors that are not network failures", async () => {
    const bug = new TypeError("bug");
    const { run, calls } = setup([bug, OK]);

    await expect(run("getFile")).rejects.toBe(bug);
    expect(calls).toHaveLength(1);
  });
});

describe("boundedRetry: budget and observability", () => {
  it("shares one budget across kinds of failure", async () => {
    const { run, calls } = setup([tooMany(1), failure(502), networkError("ECONNRESET"), failure(500), OK]);

    const response = await run("editMessageText");

    expect(response).toMatchObject({ ok: false, error_code: 500 });
    expect(calls).toHaveLength(4);
  });

  it("stops retrying when the request was aborted", async () => {
    const { run, calls } = setup([tooMany(1), OK]);

    await run("sendMessage", { aborted: true } as never);

    expect(calls).toHaveLength(1);
  });

  it("reports each retry with method, attempt, delay and reason, never the payload", async () => {
    const { run, retries } = setup([tooMany(2), failure(502), OK]);

    await run("editMessageText");

    expect(retries).toEqual([
      { method: "editMessageText", attempt: 1, delayMs: 2000, reason: "rate_limited" },
      { method: "editMessageText", attempt: 2, delayMs: 2000, reason: "server_error" },
    ]);
  });

  it("rejects invalid options", () => {
    const sleep = async (): Promise<void> => undefined;
    expect(() => boundedRetry({ sleep, maxRetries: -1 })).toThrow(/maxRetries/);
    expect(() => boundedRetry({ sleep, maxRetries: 1.5 })).toThrow(/maxRetries/);
    expect(() => boundedRetry({ sleep, maxDelaySeconds: 0 })).toThrow(/maxDelaySeconds/);
  });
});

describe("isIdempotentMethod", () => {
  it.each([
    "getMe",
    "getFile",
    "setMessageReaction",
    "setMyCommands",
    "setWebhook",
    "editMessageText",
    "editMessageReplyMarkup",
    "deleteMessage",
    "answerCallbackQuery",
    "answerInlineQuery",
    "sendChatAction",
    "sendMessageDraft",
  ])("%s is safe to repeat", (method) => {
    expect(isIdempotentMethod(method)).toBe(true);
  });

  it.each(["sendMessage", "sendRichMessage", "sendDocument", "sendPhoto", "forwardMessage", "copyMessage", "sendPoll"])(
    "%s creates something and is not safe to repeat",
    (method) => {
      expect(isIdempotentMethod(method)).toBe(false);
    },
  );
});
