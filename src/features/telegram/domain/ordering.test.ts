import { describe, expect, it } from "vitest";
import { compareByTimeThenId } from "./ordering";

type Item = { id: string; at: string };
const byAt = compareByTimeThenId<Item>((item) => item.at);

describe("compareByTimeThenId", () => {
  it("orders by instant first, then by id", () => {
    const items: Item[] = [
      { id: "b", at: "2026-09-24T07:00:00.000Z" },
      { id: "a", at: "2026-09-24T07:00:00.000Z" },
      { id: "z", at: "2026-09-24T06:00:00.000Z" },
      { id: "c", at: "2026-09-24T08:00:00.000Z" },
    ];
    expect([...items].sort(byAt).map((item) => item.id)).toEqual(["z", "a", "b", "c"]);
  });

  it("compares instants as time, not as text (fractions, missing milliseconds)", () => {
    const early = { id: "x", at: "2026-09-24T07:00:00Z" };
    const late = { id: "a", at: "2026-09-24T07:00:00.001Z" };
    expect(byAt(early, late)).toBeLessThan(0);
    expect(byAt(late, early)).toBeGreaterThan(0);
  });

  it("returns 0 only for the same instant and id", () => {
    const item = { id: "a", at: "2026-09-24T07:00:00.000Z" };
    expect(byAt(item, { ...item })).toBe(0);
  });
});
