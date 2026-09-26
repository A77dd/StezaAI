import { describe, expect, it } from "vitest";
import { capitalizeFirst, formatDayLabel, formatMoment, momentHtml } from "./dayLabel";
import { RU_TIME_WORDS } from "./format";

// Wednesday 12:00 in Moscow.
const now = "2026-09-23T09:00:00.000Z";
const day = (isoDate: string) => `${isoDate}T13:30:00.000Z`;

describe("capitalizeFirst", () => {
  it("upper-cases the first letter only", () => {
    expect(capitalizeFirst("завтра")).toBe("Завтра");
    expect(capitalizeFirst("чт")).toBe("Чт");
    expect(capitalizeFirst("Mon")).toBe("Mon");
    expect(capitalizeFirst("")).toBe("");
  });
});

describe("formatDayLabel", () => {
  it("says today and tomorrow", () => {
    expect(formatDayLabel(day("2026-09-23"), "Europe/Moscow", now)).toBe("Сегодня");
    expect(formatDayLabel(day("2026-09-24"), "Europe/Moscow", now)).toBe("Завтра");
  });

  it("uses the weekday for the rest of the coming week", () => {
    expect(formatDayLabel(day("2026-09-25"), "Europe/Moscow", now)).toBe("Пт");
    expect(formatDayLabel(day("2026-09-29"), "Europe/Moscow", now)).toBe("Вт");
  });

  it("switches to a date once the weekday would repeat one already in the week", () => {
    expect(formatDayLabel(day("2026-09-30"), "Europe/Moscow", now)).toBe("30 сент.");
    expect(formatDayLabel(day("2026-10-05"), "Europe/Moscow", now)).toBe("5 окт.");
  });

  it("adds the year for another year", () => {
    expect(formatDayLabel("2027-01-05T09:00:00.000Z", "UTC", now)).toBe("5 янв. 2027");
  });

  it("shows a past day as a date, not as a weekday", () => {
    expect(formatDayLabel(day("2026-09-20"), "Europe/Moscow", now)).toBe("20 сент.");
  });

  it("compares days in the given timezone", () => {
    const lateNow = "2026-09-23T22:00:00.000Z"; // already Thursday in Moscow
    const instant = "2026-09-24T10:00:00.000Z";

    expect(formatDayLabel(instant, "Europe/Moscow", lateNow)).toBe("Сегодня");
    expect(formatDayLabel(instant, "UTC", lateNow)).toBe("Завтра");
  });

  it("takes the words of another locale", () => {
    const words = { ...RU_TIME_WORDS, today: "today", weekdaysShort: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] } as const;

    expect(formatDayLabel(day("2026-09-23"), "UTC", now, words)).toBe("Today");
    expect(formatDayLabel(day("2026-09-25"), "UTC", now, words)).toBe("Fri");
  });
});

describe("formatMoment and momentHtml", () => {
  const instant = "2026-09-25T12:00:00.000Z";

  it("formats a single instant as weekday and local time", () => {
    expect(formatMoment(instant, "Europe/Moscow")).toBe("пт, 15:00");
    expect(formatMoment(instant, "Pacific/Auckland")).toBe("сб, 00:00");
  });

  it("wraps it in a tg-time tag with a fallback in the user's timezone", () => {
    expect(momentHtml(instant, "Europe/Moscow")).toBe(
      `<tg-time unix="${Date.parse(instant) / 1000}" format="wDt">пт, 15:00</tg-time>`,
    );
  });
});
