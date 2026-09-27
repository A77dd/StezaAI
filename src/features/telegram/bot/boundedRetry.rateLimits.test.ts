import { describe, expect, it } from "vitest";
import { OK, setup, tooMany } from "./boundedRetryFixtures";
import { boundedRetry } from "./boundedRetry";

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

  it("clamps a negative retry_after to zero instead of scheduling a negative delay", async () => {
    const { run, calls, sleeps } = setup([tooMany(-5), OK]);

    const response = await run("sendMessage");

    expect(response).toEqual(OK);
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([0]);
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

  it("rejects invalid options", () => {
    const sleep = async (): Promise<void> => undefined;
    expect(() => boundedRetry({ sleep, maxRetries: -1 })).toThrow(/maxRetries/);
    expect(() => boundedRetry({ sleep, maxRetries: 1.5 })).toThrow(/maxRetries/);
    expect(() => boundedRetry({ sleep, maxDelaySeconds: 0 })).toThrow(/maxDelaySeconds/);
  });
});
