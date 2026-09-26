import { describe, expect, it } from "vitest";
import { InvalidTimeError } from "./errors";
import { assertValidInterval, intervalsOverlap, rangesOverlap } from "./intervals";

const iv = (start: string, end: string) => ({ start, end });

describe("intervalsOverlap", () => {
  const a = iv("2026-09-25T10:00:00.000Z", "2026-09-25T11:00:00.000Z");

  it("detects partial, contained and identical overlap", () => {
    expect(intervalsOverlap(a, iv("2026-09-25T10:30:00.000Z", "2026-09-25T11:30:00.000Z"))).toBe(true);
    expect(intervalsOverlap(a, iv("2026-09-25T10:15:00.000Z", "2026-09-25T10:45:00.000Z"))).toBe(true);
    expect(intervalsOverlap(a, a)).toBe(true);
  });

  it("treats intervals as half-open: touching endpoints do not overlap", () => {
    expect(intervalsOverlap(a, iv("2026-09-25T11:00:00.000Z", "2026-09-25T12:00:00.000Z"))).toBe(false);
    expect(intervalsOverlap(a, iv("2026-09-25T09:00:00.000Z", "2026-09-25T10:00:00.000Z"))).toBe(false);
  });

  it("is symmetric", () => {
    const b = iv("2026-09-25T10:30:00.000Z", "2026-09-25T11:30:00.000Z");
    expect(intervalsOverlap(b, a)).toBe(intervalsOverlap(a, b));
  });
});

describe("assertValidInterval", () => {
  it("accepts start < end", () => {
    expect(() =>
      assertValidInterval(iv("2026-09-25T10:00:00.000Z", "2026-09-25T10:30:00.000Z")),
    ).not.toThrow();
  });

  it("rejects empty and reversed intervals", () => {
    expect(() =>
      assertValidInterval(iv("2026-09-25T10:00:00.000Z", "2026-09-25T10:00:00.000Z")),
    ).toThrow(InvalidTimeError);
    expect(() =>
      assertValidInterval(iv("2026-09-25T11:00:00.000Z", "2026-09-25T10:00:00.000Z")),
    ).toThrow(InvalidTimeError);
  });

  it("rejects malformed instants", () => {
    expect(() => assertValidInterval(iv("nope", "2026-09-25T10:00:00.000Z"))).toThrow(
      InvalidTimeError,
    );
  });
});

describe("rangesOverlap", () => {
  it("is the numeric half-open overlap that intervalsOverlap is built on", () => {
    expect(rangesOverlap(10, 20, 15, 25)).toBe(true);
    expect(rangesOverlap(10, 20, 20, 30)).toBe(false);
    expect(rangesOverlap(10, 20, 0, 10)).toBe(false);
    expect(rangesOverlap(10, 20, 12, 18)).toBe(true);
    expect(rangesOverlap(12, 18, 10, 20)).toBe(true);
  });
});
