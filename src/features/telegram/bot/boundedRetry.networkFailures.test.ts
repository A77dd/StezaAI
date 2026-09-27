import { HttpError } from "grammy";
import { describe, expect, it } from "vitest";
import { OK, networkError, setup } from "./boundedRetryFixtures";

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
