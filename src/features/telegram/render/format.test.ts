import { describe, expect, it } from "vitest";
import { InvalidTimeError, InvalidTimezoneError } from "../domain";
import { RenderError } from "./errors";
import {
  calendarDaysBetween,
  formatClock,
  formatDeadline,
  formatDuration,
  formatSlotRange,
  instantToUnixSeconds,
  slotHtml,
} from "./format";
import { RU_TIME_WORDS } from "./timeWords";
import type { TimeWords } from "./timeWords";

const ru = RU_TIME_WORDS;

const unix = (instant: string) => Date.parse(instant) / 1000;

describe("formatSlotRange", () => {
  it("shows the weekday and the local start and end times", () => {
    const slot = { start: "2026-09-11T12:00:00.000Z", end: "2026-09-11T13:00:00.000Z" };

    expect(formatSlotRange(slot, "Europe/Moscow", ru)).toBe("пт, 15:00–16:00");
  });

  it("converts to the given timezone, not the machine's", () => {
    const slot = { start: "2026-09-11T12:00:00.000Z", end: "2026-09-11T13:30:00.000Z" };

    expect(formatSlotRange(slot, "Pacific/Auckland", ru)).toBe("сб, 00:00–01:30");
    expect(formatSlotRange(slot, "America/New_York", ru)).toBe("пт, 08:00–09:30");
    expect(formatSlotRange(slot, "UTC", ru)).toBe("пт, 12:00–13:30");
  });

  it("zero-pads minutes and hours", () => {
    const slot = { start: "2026-09-11T06:05:00.000Z", end: "2026-09-11T07:00:00.000Z" };

    expect(formatSlotRange(slot, "UTC", ru)).toBe("пт, 06:05–07:00");
  });

  it("names both days when the slot crosses local midnight", () => {
    const slot = { start: "2026-09-11T20:30:00.000Z", end: "2026-09-11T21:30:00.000Z" };

    expect(formatSlotRange(slot, "Europe/Moscow", ru)).toBe("пт, 23:30 – сб, 00:30");
  });

  it("uses the local wall clock across a spring-forward change", () => {
    const slot = { start: "2026-03-29T00:30:00.000Z", end: "2026-03-29T01:30:00.000Z" };

    expect(formatSlotRange(slot, "Europe/Berlin", ru)).toBe("вс, 01:30 (UTC+1)–03:30 (UTC+2)");
  });

  it("uses the local wall clock across a fall-back change", () => {
    const slot = { start: "2026-10-25T00:30:00.000Z", end: "2026-10-25T01:30:00.000Z" };

    expect(formatSlotRange(slot, "Europe/Berlin", ru)).toBe("вс, 02:30 (UTC+2)–02:30 (UTC+1)");
  });

  it("rejects an unknown timezone with the domain error", () => {
    const slot = { start: "2026-09-11T12:00:00.000Z", end: "2026-09-11T13:00:00.000Z" };

    expect(() => formatSlotRange(slot, "Mars/Base", ru)).toThrow(InvalidTimezoneError);
  });

  it("rejects malformed instants with the domain error and empty slots with RenderError", () => {
    expect(() =>
      formatSlotRange({ start: "tomorrow", end: "2026-09-11T13:00:00.000Z" }, "UTC", ru),
    ).toThrow(InvalidTimeError);
    expect(() =>
      formatSlotRange({ start: "2026-09-11T13:00:00.000Z", end: "2026-09-11T13:00:00.000Z" }, "UTC", ru),
    ).toThrow(RenderError);
  });
});

describe("slotHtml", () => {
  const slot = { start: "2026-09-11T12:00:00.000Z", end: "2026-09-11T13:00:00.000Z" };

  it("wraps start and end in tg-time tags so every reader sees their own zone", () => {
    expect(slotHtml(slot, "Europe/Moscow", ru)).toBe(
      `<tg-time unix="${unix(slot.start)}" format="wDt">пт, 15:00</tg-time>–` +
        `<tg-time unix="${unix(slot.end)}" format="t">16:00</tg-time>`,
    );
  });

  it("uses a fallback text in the user's timezone", () => {
    expect(slotHtml(slot, "Pacific/Auckland", ru)).toContain(">сб, 00:00</tg-time>");
  });

  it("gives the end its own weekday when the slot crosses midnight", () => {
    const overnight = { start: "2026-09-11T20:30:00.000Z", end: "2026-09-11T21:30:00.000Z" };

    expect(slotHtml(overnight, "Europe/Moscow", ru)).toBe(
      `<tg-time unix="${unix(overnight.start)}" format="wDt">пт, 23:30</tg-time>–` +
        `<tg-time unix="${unix(overnight.end)}" format="wDt">сб, 00:30</tg-time>`,
    );
  });

  it("validates like formatSlotRange", () => {
    expect(() => slotHtml(slot, "Mars/Base", ru)).toThrow(InvalidTimezoneError);
    expect(() => slotHtml({ start: slot.end, end: slot.start }, "UTC", ru)).toThrow(RenderError);
  });
});

describe("formatDuration", () => {
  it.each([
    [1, "1 мин"],
    [30, "30 мин"],
    [59, "59 мин"],
    [60, "1 ч"],
    [61, "1 ч 1 мин"],
    [90, "1 ч 30 мин"],
    [120, "2 ч"],
    [125, "2 ч 5 мин"],
    [1440, "24 ч"],
    [1500, "25 ч"],
  ])("%i minutes is %s", (minutes, expected) => {
    expect(formatDuration(minutes, ru)).toBe(expected);
  });

  it.each([0, -30, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects %s", (minutes) => {
    expect(() => formatDuration(minutes, ru)).toThrow(RenderError);
  });
});

describe("formatDeadline", () => {
  const now = "2026-09-26T09:00:00.000Z"; // Saturday 12:00 in Moscow

  it("says today for the same local day", () => {
    expect(formatDeadline("2026-09-26T18:00:00.000Z", "Europe/Moscow", now, ru)).toBe("сегодня");
  });

  it("says tomorrow for the next local day", () => {
    expect(formatDeadline("2026-09-27T05:00:00.000Z", "Europe/Moscow", now, ru)).toBe("завтра");
  });

  it("names weekday, day and month for anything further out", () => {
    expect(formatDeadline("2026-10-01T09:00:00.000Z", "Europe/Moscow", now, ru)).toBe("в чт, 1 окт.");
    expect(formatDeadline("2026-09-28T09:00:00.000Z", "Europe/Moscow", now, ru)).toBe("в пн, 28 сент.");
  });

  it("uses the short form of every month", () => {
    const months = Array.from({ length: 12 }, (_unused, month) =>
      formatDeadline(new Date(Date.UTC(2027, month, 15, 9)).toISOString(), "UTC", "2027-01-01T00:00:00.000Z", ru),
    );

    expect(months.map((label) => label.split(", ")[1])).toEqual([
      "15 янв.",
      "15 февр.",
      "15 мар.",
      "15 апр.",
      "15 мая",
      "15 июн.",
      "15 июл.",
      "15 авг.",
      "15 сент.",
      "15 окт.",
      "15 нояб.",
      "15 дек.",
    ]);
  });

  it("adds the year when the deadline is in another year", () => {
    expect(formatDeadline("2027-01-05T09:00:00.000Z", "UTC", "2026-12-30T09:00:00.000Z", ru)).toBe(
      "в вт, 5 янв. 2027",
    );
  });

  it("compares local days: the same instants read differently in different zones", () => {
    const lateNow = "2026-09-26T22:00:00.000Z"; // already Sunday 01:00 in Moscow
    const deadline = "2026-09-27T10:00:00.000Z";

    expect(formatDeadline(deadline, "Europe/Moscow", lateNow, ru)).toBe("сегодня");
    expect(formatDeadline(deadline, "UTC", lateNow, ru)).toBe("завтра");
  });

  it("counts calendar days across a fall-back change (25-hour day)", () => {
    const beforeChange = "2026-10-31T23:00:00.000Z"; // Sat 19:00 in New York (EDT)

    expect(formatDeadline("2026-11-01T14:00:00.000Z", "America/New_York", beforeChange, ru)).toBe("завтра");
    expect(formatDeadline("2026-11-02T05:00:00.000Z", "America/New_York", beforeChange, ru)).toBe(
      "в пн, 2 нояб.",
    );
  });

  it("counts calendar days across a spring-forward change (23-hour day)", () => {
    const beforeChange = "2026-03-28T23:30:00.000Z"; // Sun 00:30 in Berlin (CET)

    expect(formatDeadline("2026-03-29T22:30:00.000Z", "Europe/Berlin", beforeChange, ru)).toBe("завтра");
  });

  it("does not depend on the machine's timezone", () => {
    const utcResult = formatDeadline("2026-09-27T05:00:00.000Z", "Pacific/Auckland", now, ru);

    // 18:00 Sunday in Auckland (already on summer time) vs 21:00 Saturday now: tomorrow.
    expect(utcResult).toBe("завтра");
  });

  it("rejects an unknown timezone and malformed instants with domain errors", () => {
    expect(() => formatDeadline(now, "Mars/Base", now, ru)).toThrow(InvalidTimezoneError);
    expect(() => formatDeadline("soon", "UTC", now, ru)).toThrow(InvalidTimeError);
    expect(() => formatDeadline(now, "UTC", "now", ru)).toThrow(InvalidTimeError);
  });
});

// A second vocabulary proves the words are a parameter, not baked into the logic.
const EN_WORDS: TimeWords = {
  weekdaysShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  minutes: "min",
  hours: "h",
  today: "today",
  tomorrow: "tomorrow",
  date: (day, month, year) => (year === null ? `${month} ${day}` : `${month} ${day}, ${year}`),
  onDate: (weekday, date) => `${weekday}, ${date}`,
};

describe("time words", () => {
  const slot = { start: "2026-09-11T12:00:00.000Z", end: "2026-09-11T13:00:00.000Z" };
  const now = "2026-09-26T09:00:00.000Z";

  it("formats with another vocabulary", () => {
    expect(formatSlotRange(slot, "Europe/Moscow", EN_WORDS)).toBe("Fri, 15:00–16:00");
    expect(slotHtml(slot, "Europe/Moscow", EN_WORDS)).toContain(">Fri, 15:00</tg-time>");
    expect(formatDuration(90, EN_WORDS)).toBe("1 h 30 min");
    expect(formatDeadline("2026-10-01T09:00:00.000Z", "UTC", now, EN_WORDS)).toBe("Thu, Oct 1");
    expect(formatDeadline("2027-01-05T09:00:00.000Z", "UTC", now, EN_WORDS)).toBe("Tue, Jan 5, 2027");
    expect(formatDeadline("2026-09-27T09:00:00.000Z", "UTC", now, EN_WORDS)).toBe("tomorrow");
  });
});

describe("formatClock", () => {
  it("is the zero-padded local wall clock", () => {
    expect(formatClock("2026-09-11T06:05:00.000Z", "UTC")).toBe("06:05");
    expect(formatClock("2026-09-11T12:00:00.000Z", "Pacific/Auckland")).toBe("00:00");
  });
});

describe("calendarDaysBetween", () => {
  it("counts local calendar days, not 24-hour spans", () => {
    expect(calendarDaysBetween("2026-09-26T21:00:00.000Z", "2026-09-27T09:00:00.000Z", "Europe/Moscow")).toBe(0);
    expect(calendarDaysBetween("2026-09-26T21:00:00.000Z", "2026-09-27T09:00:00.000Z", "UTC")).toBe(1);
    expect(calendarDaysBetween("2026-09-30T09:00:00.000Z", "2026-09-26T09:00:00.000Z", "UTC")).toBe(-4);
  });
});

describe("UTC offsets when the clocks change inside a slot", () => {
  const fallBack = { start: "2026-10-25T00:30:00.000Z", end: "2026-10-25T01:30:00.000Z" };

  it("keeps both wall-clock times readable in the copy text and the tg-time fallback", () => {
    expect(formatSlotRange(fallBack, "Europe/Berlin", ru)).toBe("вс, 02:30 (UTC+2)–02:30 (UTC+1)");
    expect(slotHtml(fallBack, "Europe/Berlin", ru)).toBe(
      `<tg-time unix="${unix(fallBack.start)}" format="wDt">вс, 02:30 (UTC+2)</tg-time>–` +
        `<tg-time unix="${unix(fallBack.end)}" format="t">02:30 (UTC+1)</tg-time>`,
    );
  });

  it("writes UTC for a zero offset and fractional offsets with minutes", () => {
    expect(formatSlotRange(fallBack, "Europe/London", ru)).toBe("вс, 01:30 (UTC+1)–01:30 (UTC)");
    const lordHowe = { start: "2026-10-03T15:00:00.000Z", end: "2026-10-03T16:00:00.000Z" };

    expect(formatSlotRange(lordHowe, "Australia/Lord_Howe", ru)).toBe("вс, 01:30 (UTC+10:30)–03:00 (UTC+11)");
  });

  it("adds offsets to both ends of a slot that crosses midnight and changes offset", () => {
    const slot = { start: "2026-10-24T21:30:00.000Z", end: "2026-10-25T01:30:00.000Z" };

    expect(formatSlotRange(slot, "Europe/Berlin", ru)).toBe("сб, 23:30 (UTC+2) – вс, 02:30 (UTC+1)");
  });

  it("stays plain when both ends share an offset", () => {
    const slot = { start: "2026-09-11T12:00:00.000Z", end: "2026-09-11T13:00:00.000Z" };

    expect(formatSlotRange(slot, "Europe/Berlin", ru)).toBe("пт, 14:00–15:00");
  });
});

describe("instantToUnixSeconds", () => {
  it("is whole seconds since the epoch", () => {
    expect(instantToUnixSeconds("2026-09-23T09:00:00.999Z")).toBe(1790154000);
  });

  it("rejects a malformed instant", () => {
    expect(() => instantToUnixSeconds("soon")).toThrow(InvalidTimeError);
  });
});
