import { describe, expect, it } from "vitest";
import { InvalidTimeError } from "../domain";
import { createFixedClock } from "./fixedClock";

describe("createFixedClock", () => {
  it("returns the same instant until advanced", () => {
    const clock = createFixedClock("2026-09-23T08:30:00.000Z");
    expect(clock.now()).toBe("2026-09-23T08:30:00.000Z");
    expect(clock.now()).toBe("2026-09-23T08:30:00.000Z");
  });

  it("advances by whole and fractional minutes", () => {
    const clock = createFixedClock("2026-09-23T08:30:00.000Z");
    clock.advance(30);
    expect(clock.now()).toBe("2026-09-23T09:00:00.000Z");
    clock.advance(0.5);
    expect(clock.now()).toBe("2026-09-23T09:00:30.000Z");
  });

  it("can be set to an absolute instant", () => {
    const clock = createFixedClock("2026-09-23T08:30:00.000Z");
    clock.set("2026-10-01T00:00:00.000Z");
    expect(clock.now()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("rejects an invalid start, negative or non-finite advance", () => {
    expect(() => createFixedClock("yesterday")).toThrow(InvalidTimeError);
    const clock = createFixedClock("2026-09-23T08:30:00.000Z");
    expect(() => clock.advance(-1)).toThrow(InvalidTimeError);
    expect(() => clock.advance(Number.NaN)).toThrow(InvalidTimeError);
    expect(() => clock.set("nope")).toThrow(InvalidTimeError);
    expect(clock.now()).toBe("2026-09-23T08:30:00.000Z");
  });
});
