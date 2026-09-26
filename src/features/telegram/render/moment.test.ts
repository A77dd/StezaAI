import { describe, expect, it } from "vitest";
import { formatMoment, momentHtml } from "./moment";
import { RU_TIME_WORDS } from "./timeWords";

const ru = RU_TIME_WORDS;

describe("formatMoment and momentHtml", () => {
  const instant = "2026-09-25T12:00:00.000Z";

  it("formats a single instant as weekday and local time", () => {
    expect(formatMoment(instant, "Europe/Moscow", ru)).toBe("пт, 15:00");
    expect(formatMoment(instant, "Pacific/Auckland", ru)).toBe("сб, 00:00");
  });

  it("wraps it in a tg-time tag with a fallback in the user's timezone", () => {
    expect(momentHtml(instant, "Europe/Moscow", ru)).toBe(
      `<tg-time unix="${Date.parse(instant) / 1000}" format="wDt">пт, 15:00</tg-time>`,
    );
  });
});
