import { afterEach, describe, expect, it, vi } from "vitest";
import { realSleep } from "./outbound";

/** grammY types request signals with its own shim; a real `AbortSignal` is what actually arrives. */
const signalOf = (controller: AbortController): never => controller.signal as never;

describe("realSleep", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after the delay", async () => {
    vi.useFakeTimers();
    let done = false;
    const sleeping = realSleep(5000).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(4999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await sleeping;

    expect(done).toBe(true);
  });

  it("stops waiting and rejects when the request is aborted", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const sleeping = realSleep(60_000, signalOf(controller));
    const outcome = expect(sleeping).rejects.toThrow(/aborted/);

    controller.abort();

    await outcome;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects at once for a request that was already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(realSleep(10, signalOf(controller))).rejects.toThrow(/aborted/);
  });
});
