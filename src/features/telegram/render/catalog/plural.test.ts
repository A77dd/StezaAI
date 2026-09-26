import { describe, expect, it } from "vitest";
import { RenderError } from "../errors";
import { pluralEn, pluralRu } from "./plural";

const form = (count: number) => pluralRu(count, "день", "дня", "дней");

describe("pluralRu", () => {
  it.each([
    [0, "дней"],
    [1, "день"],
    [2, "дня"],
    [3, "дня"],
    [4, "дня"],
    [5, "дней"],
    [10, "дней"],
    [11, "дней"],
    [12, "дней"],
    [14, "дней"],
    [15, "дней"],
    [20, "дней"],
    [21, "день"],
    [22, "дня"],
    [25, "дней"],
    [101, "день"],
    [102, "дня"],
    [111, "дней"],
    [112, "дней"],
    [114, "дней"],
    [121, "день"],
  ])("%i takes the form %s", (count, expected) => {
    expect(form(count)).toBe(expected);
  });

  it("treats a negative count by its absolute value", () => {
    expect(form(-1)).toBe("день");
    expect(form(-2)).toBe("дня");
    expect(form(-11)).toBe("дней");
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects %s", (count) => {
    expect(() => form(count)).toThrow(RenderError);
  });
});

describe("pluralEn", () => {
  it("uses the singular for exactly one", () => {
    expect(pluralEn(1, "day", "days")).toBe("day");
    expect(pluralEn(-1, "day", "days")).toBe("day");
    expect(pluralEn(0, "day", "days")).toBe("days");
    expect(pluralEn(2, "day", "days")).toBe("days");
    expect(pluralEn(11, "day", "days")).toBe("days");
  });

  it("rejects a fraction", () => {
    expect(() => pluralEn(1.5, "day", "days")).toThrow(RenderError);
  });
});
