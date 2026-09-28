import { describe, expect, it } from "vitest";
import type { InMemoryCalendar } from "../../adapters";
import { makeSettings, makeSource } from "../../testing/domainFixtures";
import { createTestPersonalFlowPorts } from "../../testing/personalFlowHarness";
import { SlotConflictError } from "../index";
import { createBookMeeting } from "./bookMeeting";
import type { Intent } from "../index";

const NOW = "2026-09-23T08:30:00.000Z";
const START = "2026-09-25T14:00:00.000Z";

function intent(overrides: Partial<Intent> = {}): Intent {
  return {
    kind: "meeting", title: "Встреча с Марией", deadline: null, durationMinutes: 60,
    scheduledStartAt: START, priority: "normal", participants: [], confidence: 0.95,
    ...overrides,
  };
}

async function bookedPorts() {
  const ports = createTestPersonalFlowPorts({}, NOW);
  await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
  return ports;
}

describe("bookMeeting", () => {
  it("creates the meeting, books the exact slot and schedules a reminder an hour ahead", async () => {
    const ports = await bookedPorts();
    const source = makeSource({ sourceChatId: 1001, sourceType: "forwarded_message" });

    const result = await createBookMeeting(ports)({ userId: "user_1", intent: intent(), source });

    expect(result.kind).toBe("meeting_booked");
    if (result.kind !== "meeting_booked") throw new Error("expected meeting_booked");
    await expect(ports.tasks.get("user_1", result.task.id)).resolves.toMatchObject({
      status: "scheduled", kind: "meeting", bookingId: result.booking.id, meetingReminderEnabled: true,
    });
    expect(result.booking.slot).toEqual({ start: START, end: "2026-09-25T15:00:00.000Z" });
    await expect(ports.reminders.exportForUser("user_1")).resolves.toEqual([
      expect.objectContaining({ status: "pending", kind: "block_start", dueAt: "2026-09-25T13:00:00.000Z", chatId: 1001 }),
    ]);
  });

  it("keeps the meeting link on the task when the message carried one", async () => {
    const ports = await bookedPorts();
    const result = await createBookMeeting(ports)({
      userId: "user_1",
      intent: intent({ meetingUrl: "https://meet.example.test/room" }),
      source: makeSource({ sourceChatId: 1001 }),
    });
    expect(result.kind === "meeting_booked" && result.task.meetingUrl).toBe("https://meet.example.test/room");
  });

  it("turns a busy requested time into a fresh proposal without touching the calendar", async () => {
    const ports = await bookedPorts();
    (ports.calendar as InMemoryCalendar).addBusyInterval("user_1", { start: START, end: "2026-09-25T15:00:00.000Z" });

    const result = await createBookMeeting(ports)({ userId: "user_1", intent: intent(), source: makeSource({ sourceChatId: 1001 }) });

    expect(result.kind).toBe("meeting_conflict");
    if (result.kind !== "meeting_conflict") throw new Error("expected meeting_conflict");
    await expect(ports.tasks.get("user_1", result.task.id)).resolves.toMatchObject({ status: "proposed", bookingId: null });
    await expect(ports.proposals.get("user_1", result.task.id)).resolves.toMatchObject({ taskId: result.task.id });
    // Nothing was booked and no reminder was scheduled for the busy time.
    expect(result.proposal.slots.every((slot) => slot.start !== START)).toBe(true);
    await expect(ports.reminders.exportForUser("user_1")).resolves.toEqual([]);
  });

  it("recovers the proposal path when the calendar rejects the block with a conflict", async () => {
    const ports = await bookedPorts();
    const calendar = ports.calendar;
    // A calendar adapter that answers "occupied" at the very last step (a
    // race the busy check missed): the block is rejected with SlotConflictError.
    const flaky = {
      ...calendar,
      async createBlock(): ReturnType<typeof calendar.createBlock> {
        throw new SlotConflictError("the requested time was taken");
      },
    };
    const failing = { ...ports, calendar: flaky };

    const result = await createBookMeeting(failing)({ userId: "user_1", intent: intent(), source: makeSource({ sourceChatId: 1001 }) });

    expect(result.kind).toBe("meeting_conflict");
    await expect(failing.tasks.get("user_1", (result as { task: { id: string } }).task.id)).resolves.toMatchObject({ status: "proposed" });
  });

  it("skips the reminder when the forward has no chat or the meeting starts within the hour", async () => {
    const ports = await bookedPorts();
    await createBookMeeting(ports)({ userId: "user_1", intent: intent(), source: makeSource({ sourceChatId: null }) });
    await expect(ports.reminders.exportForUser("user_1")).resolves.toEqual([]);

    const soonPorts = await bookedPorts();
    await createBookMeeting(soonPorts)({
      userId: "user_1",
      intent: intent({ scheduledStartAt: "2026-09-23T09:00:00.000Z" }),
      source: makeSource({ sourceChatId: 1001 }),
    });
    await expect(soonPorts.reminders.exportForUser("user_1")).resolves.toEqual([]);
  });

  it("fails loudly without a start time or without settings", async () => {
    const ports = await bookedPorts();
    await expect(
      createBookMeeting(ports)({ userId: "user_1", intent: intent({ scheduledStartAt: null }), source: makeSource() }),
    ).rejects.toThrow(/start time is required/);

    const noSettings = createTestPersonalFlowPorts({}, NOW);
    await expect(
      createBookMeeting(noSettings)({ userId: "user_1", intent: intent(), source: makeSource() }),
    ).rejects.toThrow(/no settings/);
  });
});
