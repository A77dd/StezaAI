import { describe, expect, it } from "vitest";
import { RU_TIME_WORDS, weekdayName, yearUnlessCurrent } from "./timeWords";

describe("weekdayName", () => {
  it("looks up the ISO weekday, Monday first", () => {
    expect(weekdayName(RU_TIME_WORDS, 1)).toBe("пн");
    expect(weekdayName(RU_TIME_WORDS, 7)).toBe("вс");
  });
});

describe("yearUnlessCurrent", () => {
  it("is null for the current year and the year otherwise", () => {
    expect(yearUnlessCurrent(2026, 2026)).toBeNull();
    expect(yearUnlessCurrent(2027, 2026)).toBe(2027);
    expect(yearUnlessCurrent(2025, 2026)).toBe(2025);
  });
});

describe("RU_TIME_WORDS", () => {
  it("writes dates and deadlines in Russian", () => {
    expect(RU_TIME_WORDS.date(5, "янв.", null)).toBe("5 янв.");
    expect(RU_TIME_WORDS.date(5, "янв.", 2027)).toBe("5 янв. 2027");
    expect(RU_TIME_WORDS.onDate("вт", "5 янв.")).toBe("в вт, 5 янв.");
  });
});
