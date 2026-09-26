import { describe, expect, it } from "vitest";
import { DEFAULT_TEST_START, createTestClock } from "./testClock";

describe("createTestClock", () => {
  it("starts at the default instant and does not move on its own", () => {
    const clock = createTestClock();

    expect(clock.now()).toBe(DEFAULT_TEST_START);
    expect(clock.nowMs()).toBe(Date.parse(DEFAULT_TEST_START));
    expect(clock.now()).toBe(DEFAULT_TEST_START);
  });

  it("advances by milliseconds and seconds", () => {
    const clock = createTestClock("2026-09-23T09:00:00.000Z");

    clock.advanceMs(1500);
    expect(clock.now()).toBe("2026-09-23T09:00:01.500Z");
    clock.advanceSeconds(58.5);
    expect(clock.now()).toBe("2026-09-23T09:01:00.000Z");
  });

  it("rejects negative and non-finite steps", () => {
    const clock = createTestClock();

    expect(() => clock.advanceMs(-1)).toThrow(RangeError);
    expect(() => clock.advanceMs(Number.NaN)).toThrow(RangeError);
    expect(() => clock.advanceSeconds(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("can be moved to an absolute instant", () => {
    const clock = createTestClock();

    clock.set("2027-01-01T00:00:00.000Z");

    expect(clock.now()).toBe("2027-01-01T00:00:00.000Z");
  });
});
