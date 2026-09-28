import { describe, expect, it } from "vitest";
import type { IntentParser } from "../index";
import { makeSettings, makeSource, makeTask } from "../../testing/domainFixtures";
import { createTestPersonalFlowPorts } from "../../testing/personalFlowHarness";
import type { InMemoryCalendar } from "../../adapters";
import { createRescheduleMeeting } from "./rescheduleMeeting";

const NOW = "2026-09-23T08:30:00.000Z";
const OLD_SLOT = { start: "2026-09-25T14:00:00.000Z", end: "2026-09-25T15:00:00.000Z" };
const NEW_START = "2026-09-24T16:00:00.000Z";

function parser(start: string): IntentParser {
  return {
    parse: async () => ({
      kind: "meeting", title: "Встреча", deadline: null, durationMinutes: null,
      scheduledStartAt: start, priority: "normal", participants: [], confidence: 0.95,
    }),
  };
}

async function bookedMeeting(ports: ReturnType<typeof createTestPersonalFlowPorts>) {
  await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
  const task = makeTask({ id: "meeting_1", kind: "meeting", status: "scheduled", source: makeSource({ sourceChatId: 1001 }), bookingId: "booking_1" });
  await ports.tasks.create(task);
  const booking = await ports.calendar.createBlock({ userId: "user_1", taskId: task.id, title: task.title, slot: OLD_SLOT });
  await ports.tasks.update("user_1", task.id, { bookingId: booking.id });
  return task;
}

describe("rescheduleMeeting", () => {
  it("moves the existing block and updates its reminder when the requested time is free", async () => {
    const ports = createTestPersonalFlowPorts({ intentParser: parser(NEW_START) }, NOW);
    const task = await bookedMeeting(ports);
    await ports.reminders.schedule({ id: "previous_reminder", userId: "user_1", chatId: 1001, taskId: task.id, kind: "block_start", dueAt: "2026-09-25T13:00:00.000Z" });

    const result = await createRescheduleMeeting(ports)({ userId: "user_1", taskId: task.id, text: "завтра в 19:00" });

    expect(result.kind).toBe("moved");
    if (result.kind !== "moved") throw new Error("expected moved");
    expect(result.booking.slot).toEqual({ start: NEW_START, end: "2026-09-24T17:00:00.000Z" });
    await expect(ports.tasks.get("user_1", task.id)).resolves.toMatchObject({ status: "scheduled", bookingId: result.booking.id });
    await expect(ports.reminders.exportForUser("user_1")).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "cancelled", dueAt: "2026-09-25T13:00:00.000Z" }),
      expect.objectContaining({ status: "pending", dueAt: "2026-09-24T15:00:00.000Z" }),
    ]));
  });

  it("preserves the current booking when the requested time overlaps another event", async () => {
    const ports = createTestPersonalFlowPorts({ intentParser: parser(NEW_START) }, NOW);
    const task = await bookedMeeting(ports);
    (ports.calendar as InMemoryCalendar).addBusyInterval("user_1", { start: NEW_START, end: "2026-09-24T17:00:00.000Z" });

    const result = await createRescheduleMeeting(ports)({ userId: "user_1", taskId: task.id, text: "завтра в 19:00" });

    expect(result).toEqual({ kind: "time_conflict" });
    await expect(ports.calendar.getBlock("user_1", task.bookingId!)).resolves.toMatchObject({ slot: OLD_SLOT });
    await expect(ports.tasks.get("user_1", task.id)).resolves.toMatchObject({ status: "scheduled", bookingId: task.bookingId });
  });
});
