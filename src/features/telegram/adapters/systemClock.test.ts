import { afterEach, describe, expect, it, vi } from "vitest";
import { createSystemClock } from "./systemClock";

describe("createSystemClock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the current time as a canonical ISO-8601 UTC instant", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T08:30:00.123Z"));
    expect(createSystemClock().now()).toBe("2026-09-23T08:30:00.123Z");
  });

  it("follows the system clock on every call", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T08:30:00.000Z"));
    const clock = createSystemClock();
    vi.advanceTimersByTime(60_000);
    expect(clock.now()).toBe("2026-09-23T08:31:00.000Z");
  });
});
