import { describe, expect, it } from "vitest";
import { makeSource, makeTask } from "../../testing/domainFixtures";
import { makeViewContext, NOW } from "../../testing/viewFixtures";
import { meetingRescheduleView } from "./meeting";

describe("meetingRescheduleView time slots", () => {
  it("wraps at four buttons per row and keeps complete hour labels", () => {
    const view = meetingRescheduleView(
      {
        task: makeTask({ id: "task_1", kind: "meeting", source: makeSource() }),
        slot: { start: "2026-09-23T13:00:00.000Z", end: "2026-09-23T14:00:00.000Z" },
        busy: [],
        cardMessageId: 42,
        now: NOW,
      },
      { year: 2026, month: 9, day: 25 },
      makeViewContext(),
    );

    const rows = [...view.html.matchAll(/<tg-button-row>([\s\S]*?)<\/tg-button-row>/g)].map((match) =>
      [...match[1]!.matchAll(/<tg-button[^>]*>([^<]+)<\/tg-button>/g)].map((button) => button[1]!),
    );
    const timeRows = rows.filter((row) => row.some((label) => /^\d{1,2}:00$/.test(label)));

    expect(timeRows).toEqual([
      ["8:00", "9:00", "10:00", "11:00"],
      ["12:00", "13:00", "14:00", "15:00"],
      ["16:00", "17:00", "18:00", "19:00"],
      ["20:00"],
    ]);
    expect(timeRows.every((row) => row.length <= 4)).toBe(true);
  });
});
