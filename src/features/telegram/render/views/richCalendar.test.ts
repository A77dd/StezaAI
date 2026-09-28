import { describe, expect, it } from "vitest";
import { makeTask } from "../../testing/domainFixtures";
import { makeViewContext } from "../../testing/viewFixtures";
import { richCalendarDayView, richCalendarMonthView } from "./richCalendar";

// The view fixture clock: NOW = 2026-09-23T09:00Z (Wednesday, Moscow evening).
const ctx = makeViewContext();
const task = makeTask({ id: "task_1", kind: "task", status: "proposed" });

function slotAt(dayOffset: number, hourUtc: number) {
  const start = Date.UTC(2026, 8, 23 + dayOffset, hourUtc);
  return { start: new Date(start).toISOString(), end: new Date(start + 60 * 60 * 1000).toISOString() };
}

function buttonRows(html: string): string[][] {
  return Array.from(html.matchAll(/<tg-button-row>(.*?)<\/tg-button-row>/g))
    .map((row) => Array.from(row[1]!.matchAll(/<tg-button[^>]*>([^<]*)<\/tg-button>/g)).map((b) => b[1]!));
}

describe("richCalendar: the current-week boundary", () => {
  it("keeps past days of the current week visible but inactive", () => {
    // NOW is Wednesday 2026-09-23: Monday 21 and Tuesday 22 are gone.
    const view = richCalendarMonthView({ task, slots: [slotAt(1, 10)] }, { year: 2026, month: 9 }, ctx);
    const html = view.html;
    expect(html).toContain('<tg-button type="disabled">21</tg-button>');
    expect(html).toContain('<tg-button type="disabled">22</tg-button>');
    // Thursday 24 (a day with a slot) is a live button.
    expect(html).toContain(">24</tg-button>");
    // Alignment blanks for the leading days stay in place.
    expect(html).toContain('type="disabled">·</tg-button>');
  });

  it("never navigates to a month before the current one", () => {
    const view = richCalendarMonthView({ task, slots: [slotAt(1, 10)] }, { year: 2026, month: 9 }, ctx);
    // The current month leaves ‹ as a disabled cell, not a callback button.
    expect(view.html).not.toMatch(/type="callback_data"[^>]*>[^<]*‹/);
  });
});

describe("richCalendar: slot rows", () => {
  it("wraps five slots into rows of at most four, preserving the order", () => {
    const slots = [slotAt(1, 9), slotAt(1, 10), slotAt(1, 11), slotAt(1, 12), slotAt(1, 13)];
    const view = richCalendarDayView({ task, slots }, { year: 2026, month: 9, day: 24 }, ctx);
    const rows = buttonRows(view.html).filter((row) => row.some((label) => label.includes(":00–")));

    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(4);
    expect(rows[1]).toHaveLength(1);
    const flat = rows.flat();
    expect(flat[0]).toContain("12:00–13:00");
    expect(flat[4]).toContain("16:00–17:00");
  });

  it("binds each slot button to its own index and times in the stored proposal", () => {
    const slots = [slotAt(1, 9), slotAt(1, 10), slotAt(1, 11), slotAt(1, 12), slotAt(1, 13)];
    const view = richCalendarDayView({ task, slots }, { year: 2026, month: 9, day: 24 }, ctx);
    // The specs carry the slot's index and times in proposal order; the
    // presenter binds tokens and the use-case re-validates against the store.
    const picks = view.actions.filter((a) => a.action === "slot.pick");
    expect(picks).toHaveLength(5);
    expect(picks.map((a) => (a.payload as { slotIndex: number }).slotIndex)).toEqual([0, 1, 2, 3, 4]);
    expect((picks[4]!.payload as { slotStart: string }).slotStart).toBe(slots[4]!.start);
  });
});
