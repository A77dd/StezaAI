import { describe, expect, it } from "vitest";
import { OK, failure, networkError, setup, tooMany } from "./boundedRetryFixtures";

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
});
