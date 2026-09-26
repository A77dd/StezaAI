import { describe, expect, it } from "vitest";
import { InvalidTimeError, InvalidTimezoneError } from "./errors";
import {
  addMinutes,
  assertValidTimezone,
  formatInstant,
  fromZoned,
  parseClockTime,
  parseInstant,
  startOfDayInZone,
  toZonedParts,
} from "./time";

describe("parseInstant / formatInstant", () => {
  it("round-trips canonical ISO-8601 UTC instants", () => {
    const ms = parseInstant("2026-09-25T20:59:00.000Z");
    expect(ms).toBe(Date.UTC(2026, 8, 25, 20, 59));
    expect(formatInstant(ms)).toBe("2026-09-25T20:59:00.000Z");
  });

  it("accepts instants without milliseconds", () => {
    expect(parseInstant("2026-09-25T20:59:00Z")).toBe(Date.UTC(2026, 8, 25, 20, 59));
  });

  it.each([
    "2026-02-30T00:00:00.000Z",
    "2026-02-29T00:00:00.000Z", // 2026 is not a leap year
    "2026-04-31T12:00:00Z",
    "2026-06-31T12:00:00Z",
    "2026-01-01T24:00:00Z",
    "2026-01-01T24:00:00.000Z",
    "2026-01-01T00:60:00Z",
    "2026-01-01T00:00:60Z",
    "2026-00-10T00:00:00Z",
    "2026-01-00T00:00:00Z",
  ])("rejects the impossible date or time %j instead of normalising it", (value) => {
    expect(() => parseInstant(value)).toThrow(InvalidTimeError);
  });

  it("accepts real leap days and the last instant of a day", () => {
    expect(parseInstant("2028-02-29T00:00:00Z")).toBe(Date.UTC(2028, 1, 29));
    expect(parseInstant("2026-12-31T23:59:59.999Z")).toBe(Date.UTC(2026, 11, 31, 23, 59, 59, 999));
  });

  it("accepts short fractions and reads them as milliseconds", () => {
    expect(parseInstant("2026-09-25T20:59:00.5Z")).toBe(Date.UTC(2026, 8, 25, 20, 59, 0, 500));
  });

  it.each([
    "2026-09-25",
    "2026-09-25T20:59:00+03:00",
    "2026-09-25 20:59:00Z",
    "not a date",
    "2026-13-45T00:00:00Z",
    "",
  ])("rejects %j", (value) => {
    expect(() => parseInstant(value)).toThrow(InvalidTimeError);
  });

  it("rejects non-finite milliseconds when formatting", () => {
    expect(() => formatInstant(Number.NaN)).toThrow(InvalidTimeError);
  });

  it("rejects years that would not format as a four-digit ISO year", () => {
    expect(() => formatInstant(Date.UTC(10000, 0, 1))).toThrow(InvalidTimeError);
    expect(() => formatInstant(Date.UTC(999, 11, 31))).toThrow(InvalidTimeError);
  });
});

describe("assertValidTimezone", () => {
  it.each(["Europe/Moscow", "Europe/Berlin", "America/New_York", "UTC"])(
    "accepts %s",
    (tz) => {
      expect(() => assertValidTimezone(tz)).not.toThrow();
    },
  );

  it.each(["", "Foo/Bar", "Moscow time"])("rejects the unknown identifier %j", (tz) => {
    expect(() => assertValidTimezone(tz)).toThrow(InvalidTimezoneError);
  });

  // These are rejected by an explicit rule, not by whatever the runtime's Intl accepts.
  it.each(["+03:00", "-05:00", "+0300", "Etc/GMT+3", "Etc/GMT-14", "Etc/UTC"])(
    "rejects the offset or fixed-offset form %j",
    (tz) => {
      expect(() => assertValidTimezone(tz)).toThrow(/offset|fixed/i);
      expect(() => assertValidTimezone(tz)).toThrow(InvalidTimezoneError);
    },
  );

  it("returns the canonical name, whatever the input casing", () => {
    expect(assertValidTimezone("europe/moscow")).toBe("Europe/Moscow");
    expect(assertValidTimezone("AMERICA/NEW_YORK")).toBe("America/New_York");
    expect(assertValidTimezone("Europe/Berlin")).toBe("Europe/Berlin");
  });

  it("works with a non-canonical name everywhere a timezone is taken", () => {
    expect(toZonedParts("2026-09-25T20:59:00.000Z", "europe/moscow")).toEqual(
      toZonedParts("2026-09-25T20:59:00.000Z", "Europe/Moscow"),
    );
    expect(fromZoned({ year: 2026, month: 9, day: 25, hour: 23, minute: 59 }, "EUROPE/MOSCOW")).toBe(
      "2026-09-25T20:59:00.000Z",
    );
  });
});

describe("parseClockTime", () => {
  it("parses HH:MM into minutes after midnight", () => {
    expect(parseClockTime("00:00")).toBe(0);
    expect(parseClockTime("09:30")).toBe(570);
    expect(parseClockTime("23:59")).toBe(1439);
  });

  it.each(["9:30", "24:00", "12:60", "12", "ab:cd", "12:30:00"])(
    "rejects %j",
    (value) => {
      expect(() => parseClockTime(value)).toThrow(InvalidTimeError);
    },
  );
});

describe("toZonedParts", () => {
  it("converts to Europe/Moscow (no DST, UTC+3)", () => {
    expect(toZonedParts("2026-09-25T20:59:00.000Z", "Europe/Moscow")).toEqual({
      year: 2026,
      month: 9,
      day: 25,
      hour: 23,
      minute: 59,
      isoWeekday: 5,
    });
  });

  it("rolls over the date across midnight", () => {
    expect(toZonedParts("2026-09-25T21:00:00.000Z", "Europe/Moscow")).toMatchObject({
      day: 26,
      hour: 0,
      minute: 0,
      isoWeekday: 6,
    });
  });

  it("reports Sunday as 7 and Monday as 1", () => {
    expect(toZonedParts("2026-09-27T12:00:00.000Z", "UTC").isoWeekday).toBe(7);
    expect(toZonedParts("2026-09-28T12:00:00.000Z", "UTC").isoWeekday).toBe(1);
  });

  it("uses hour 0, never 24, at local midnight", () => {
    expect(toZonedParts("2026-01-01T00:00:00.000Z", "UTC").hour).toBe(0);
  });

  it("respects DST offsets (Berlin summer is UTC+2, winter UTC+1)", () => {
    expect(toZonedParts("2026-07-01T10:00:00.000Z", "Europe/Berlin").hour).toBe(12);
    expect(toZonedParts("2026-12-01T10:00:00.000Z", "Europe/Berlin").hour).toBe(11);
  });

  it("throws for an invalid timezone", () => {
    expect(() => toZonedParts("2026-01-01T00:00:00.000Z", "Foo/Bar")).toThrow(
      InvalidTimezoneError,
    );
  });
});

describe("fromZoned", () => {
  const local = (
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
  ) => ({ year, month, day, hour, minute });

  it("converts Moscow local time to UTC", () => {
    expect(fromZoned(local(2026, 9, 25, 23, 59), "Europe/Moscow")).toBe(
      "2026-09-25T20:59:00.000Z",
    );
  });

  it("round-trips ordinary local times", () => {
    const instant = fromZoned(local(2026, 7, 1, 12, 0), "Europe/Berlin");
    expect(instant).toBe("2026-07-01T10:00:00.000Z");
    expect(toZonedParts(instant, "Europe/Berlin")).toMatchObject({ hour: 12, minute: 0 });
  });

  describe("DST gap (spring forward): local time that does not exist moves forward", () => {
    it("Berlin 2026-03-29 02:30 does not exist and becomes 03:30 CEST", () => {
      const instant = fromZoned(local(2026, 3, 29, 2, 30), "Europe/Berlin");
      expect(instant).toBe("2026-03-29T01:30:00.000Z");
      expect(toZonedParts(instant, "Europe/Berlin")).toMatchObject({ hour: 3, minute: 30 });
    });

    it("New York 2026-03-08 02:30 does not exist and becomes 03:30 EDT", () => {
      const instant = fromZoned(local(2026, 3, 8, 2, 30), "America/New_York");
      expect(instant).toBe("2026-03-08T07:30:00.000Z");
      expect(toZonedParts(instant, "America/New_York")).toMatchObject({ hour: 3, minute: 30 });
    });

    it("times just outside the gap are unaffected", () => {
      expect(fromZoned(local(2026, 3, 8, 1, 30), "America/New_York")).toBe(
        "2026-03-08T06:30:00.000Z",
      );
      expect(fromZoned(local(2026, 3, 8, 3, 0), "America/New_York")).toBe(
        "2026-03-08T07:00:00.000Z",
      );
    });
  });

  describe("DST overlap (fall back): ambiguous local time picks the earlier instant", () => {
    it("Berlin 2026-10-25 02:30 happens twice; picks the CEST one", () => {
      expect(fromZoned(local(2026, 10, 25, 2, 30), "Europe/Berlin")).toBe(
        "2026-10-25T00:30:00.000Z",
      );
    });

    it("New York 2026-11-01 01:30 happens twice; picks the EDT one", () => {
      expect(fromZoned(local(2026, 11, 1, 1, 30), "America/New_York")).toBe(
        "2026-11-01T05:30:00.000Z",
      );
    });

    it("times just after the overlap use the new offset", () => {
      expect(fromZoned(local(2026, 11, 1, 2, 0), "America/New_York")).toBe(
        "2026-11-01T07:00:00.000Z",
      );
    });
  });

  it("is deterministic: same input, same output", () => {
    const a = fromZoned(local(2026, 10, 25, 2, 30), "Europe/Berlin");
    const b = fromZoned(local(2026, 10, 25, 2, 30), "Europe/Berlin");
    expect(a).toBe(b);
  });

  it("rolls out-of-range fields over like Date.UTC (day 32, hour 24)", () => {
    expect(fromZoned(local(2026, 9, 31, 0, 0), "UTC")).toBe("2026-10-01T00:00:00.000Z");
    expect(fromZoned(local(2026, 9, 25, 24, 0), "UTC")).toBe("2026-09-26T00:00:00.000Z");
  });

  it.each([0, 50, 99, 999, 10000, 12345])(
    "rejects year %s instead of mapping it (Date.UTC maps 0-99 to 1900-1999)",
    (year) => {
      expect(() =>
        fromZoned({ year, month: 1, day: 1, hour: 0, minute: 0 }, "UTC"),
      ).toThrow(InvalidTimeError);
    },
  );

  it("accepts the boundary years 1000 and 9999", () => {
    expect(fromZoned(local(1000, 1, 1, 0, 0), "UTC")).toBe("1000-01-01T00:00:00.000Z");
    expect(fromZoned(local(9999, 6, 1, 12, 0), "UTC")).toBe("9999-06-01T12:00:00.000Z");
  });

  it("rejects a roll-over that leaves the supported year range", () => {
    expect(() => fromZoned(local(9999, 12, 32, 0, 0), "UTC")).toThrow(InvalidTimeError);
  });

  it("rejects non-integer fields", () => {
    expect(() => fromZoned(local(2026, 9, 25, 10.5, 0), "UTC")).toThrow(InvalidTimeError);
  });
});

describe("addMinutes", () => {
  it("adds and subtracts whole minutes on the timeline", () => {
    expect(addMinutes("2026-09-25T20:59:00.000Z", 1)).toBe("2026-09-25T21:00:00.000Z");
    expect(addMinutes("2026-09-25T20:59:00.000Z", -59)).toBe("2026-09-25T20:00:00.000Z");
  });

  it("is absolute time: crossing a DST change does not shift the wall clock rule", () => {
    // 2026-03-29T00:30Z is 01:30 CET in Berlin; +60 real minutes is 03:30 CEST.
    const result = addMinutes("2026-03-29T00:30:00.000Z", 60);
    expect(toZonedParts(result, "Europe/Berlin")).toMatchObject({ hour: 3, minute: 30 });
  });

  it("rejects non-finite minutes", () => {
    expect(() => addMinutes("2026-09-25T20:59:00.000Z", Number.NaN)).toThrow(InvalidTimeError);
  });
});

describe("startOfDayInZone", () => {
  it("returns local midnight as a UTC instant (Moscow)", () => {
    expect(startOfDayInZone("2026-09-25T20:59:00.000Z", "Europe/Moscow")).toBe(
      "2026-09-24T21:00:00.000Z",
    );
  });

  it("uses the local date, not the UTC date", () => {
    // 22:00Z is already the next day in Moscow.
    expect(startOfDayInZone("2026-09-25T22:00:00.000Z", "Europe/Moscow")).toBe(
      "2026-09-25T21:00:00.000Z",
    );
  });

  it("handles a spring-forward day (New York is UTC-5 at midnight)", () => {
    expect(startOfDayInZone("2026-03-08T15:00:00.000Z", "America/New_York")).toBe(
      "2026-03-08T05:00:00.000Z",
    );
  });

  it("handles a fall-back day (New York is UTC-4 at midnight)", () => {
    expect(startOfDayInZone("2026-11-01T15:00:00.000Z", "America/New_York")).toBe(
      "2026-11-01T04:00:00.000Z",
    );
  });
});
