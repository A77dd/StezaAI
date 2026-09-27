import { describe, expect, it } from "vitest";
import type { InMemoryCalendar } from "../../adapters";
import { makeSettings, makeSource, makeTask } from "../../testing/domainFixtures";
import { createTestPersonalFlowPorts } from "../../testing/personalFlowHarness";
import type { BlockBooking, CalendarPort, Slot, StoredSlotProposal } from "../index";
import { createConfirmSlot } from "./confirmSlot";

const NOW = "2026-09-28T06:10:00.000Z"; // Monday 09:10 Europe/Moscow

const SLOTS: readonly Slot[] = [
  { start: "2026-09-28T09:30:00.000Z", end: "2026-09-28T10:30:00.000Z" },
  { start: "2026-09-28T11:00:00.000Z", end: "2026-09-28T12:00:00.000Z" },
  { start: "2026-09-28T13:00:00.000Z", end: "2026-09-28T14:00:00.000Z" },
];

async function setUpProposedTask(
  ports: ReturnType<typeof createTestPersonalFlowPorts>,
  overrides: { slots?: readonly Slot[]; intensity?: "low" | "normal" | "high" } = {},
) {
  await ports.settings.upsert(
    makeSettings({ timezoneConfirmed: true, notificationIntensity: overrides.intensity ?? "normal" }),
  );
  const task = makeTask({ status: "proposed", source: makeSource({ sourceChatId: 1001 }) });
  await ports.tasks.create(task);
  const proposal: StoredSlotProposal = {
    taskId: task.id,
    slots: overrides.slots ?? SLOTS,
    createdAt: NOW,
    expiresAt: "2026-09-29T06:10:00.000Z",
  };
  await ports.proposals.save("user_1", proposal);
  return task;
}

describe("confirmSlot", () => {
  it("books the slot, edits the task to scheduled, and deletes the proposal", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await setUpProposedTask(ports);
    const confirmSlot = createConfirmSlot(ports);

    const result = await confirmSlot({ userId: "user_1", taskId: "task_1", slotIndex: 0 });

    expect(result.kind).toBe("booked");
    if (result.kind !== "booked") throw new Error("expected booked");
    expect(result.task).toMatchObject({ status: "scheduled", bookingId: result.booking.id });
    expect(result.booking.slot).toEqual(SLOTS[0]);
    await expect(ports.proposals.get("user_1", "task_1")).resolves.toBeNull();
    await expect(ports.calendar.getBlock("user_1", result.booking.id)).resolves.toEqual(result.booking);
  });

  it.each([
    ["low", 5],
    ["normal", 10],
    ["high", 15],
  ] as const)("schedules a block_start reminder %s minutes before the block for '%s' intensity, and a check-in at the end", async (intensity, leadMinutes) => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await setUpProposedTask(ports, { intensity });
    const confirmSlot = createConfirmSlot(ports);

    await confirmSlot({ userId: "user_1", taskId: "task_1", slotIndex: 0 });

    const reminders = await ports.reminders.exportForUser("user_1");
    expect(reminders).toHaveLength(2);
    const blockStart = reminders.find((reminder) => reminder.kind === "block_start");
    const checkIn = reminders.find((reminder) => reminder.kind === "check_in");
    expect(blockStart?.dueAt).toBe(new Date(Date.parse(SLOTS[0]!.start) - leadMinutes * 60_000).toISOString());
    expect(checkIn?.dueAt).toBe(SLOTS[0]!.end);
    expect(blockStart?.chatId).toBe(1001);
  });

  it("skips the block_start reminder when its time has already passed, but still schedules the check-in", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    // Slot starts only 2 minutes from now; a 10-minute lead is already in the past.
    const closeSlot: Slot = { start: "2026-09-28T06:12:00.000Z", end: "2026-09-28T07:12:00.000Z" };
    await setUpProposedTask(ports, { slots: [closeSlot] });
    const confirmSlot = createConfirmSlot(ports);

    await confirmSlot({ userId: "user_1", taskId: "task_1", slotIndex: 0 });

    const reminders = await ports.reminders.exportForUser("user_1");
    expect(reminders.map((reminder) => reminder.kind)).toEqual(["check_in"]);
  });

  it("returns no_such_slot for an out-of-range index and leaves the task proposed", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await setUpProposedTask(ports, { slots: [SLOTS[0]!] });
    const confirmSlot = createConfirmSlot(ports);

    const result = await confirmSlot({ userId: "user_1", taskId: "task_1", slotIndex: 2 });

    expect(result).toEqual({ kind: "no_such_slot" });
    await expect(ports.tasks.get("user_1", "task_1")).resolves.toMatchObject({ status: "proposed" });
  });

  it("a second confirmation of the same slot is idempotent: already_booked with the same booking", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await setUpProposedTask(ports);
    const confirmSlot = createConfirmSlot(ports);

    const first = await confirmSlot({ userId: "user_1", taskId: "task_1", slotIndex: 0 });
    const second = await confirmSlot({ userId: "user_1", taskId: "task_1", slotIndex: 0 });

    expect(first.kind).toBe("booked");
    expect(second.kind).toBe("already_booked");
    if (first.kind !== "booked" || second.kind !== "already_booked") throw new Error("unexpected kinds");
    expect(second.booking).toEqual(first.booking);
  });

  it("of two concurrent confirmations for different slots, exactly one books and the other sees already_booked_other_slot", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await setUpProposedTask(ports);
    const confirmSlot = createConfirmSlot(ports);

    const [a, b] = await Promise.all([
      confirmSlot({ userId: "user_1", taskId: "task_1", slotIndex: 0 }),
      confirmSlot({ userId: "user_1", taskId: "task_1", slotIndex: 1 }),
    ]);

    const outcomes = [a, b];
    const booked = outcomes.filter((outcome) => outcome.kind === "booked");
    const other = outcomes.filter((outcome) => outcome.kind === "already_booked_other_slot");
    expect(booked).toHaveLength(1);
    expect(other).toHaveLength(1);
    const bookedResult = booked[0] as Extract<(typeof outcomes)[number], { kind: "booked" }>;
    const otherResult = other[0] as Extract<(typeof outcomes)[number], { kind: "already_booked_other_slot" }>;
    expect(otherResult.booking).toEqual(bookedResult.booking);

    const finalTask = await ports.tasks.get("user_1", "task_1");
    expect(finalTask?.status).toBe("scheduled");
    await expect(ports.reminders.exportForUser("user_1")).resolves.toHaveLength(2);
  });

  it("when an external event took the slot, rolls back to proposed and returns a fresh slot_taken proposal", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await setUpProposedTask(ports);
    (ports.calendar as InMemoryCalendar).addBusyInterval("user_1", SLOTS[0]!);
    const confirmSlot = createConfirmSlot(ports);

    const result = await confirmSlot({ userId: "user_1", taskId: "task_1", slotIndex: 0 });

    expect(result.kind).toBe("slot_taken");
    if (result.kind !== "slot_taken") throw new Error("expected slot_taken");
    expect(result.proposal.taskId).toBe("task_1");
    for (const slot of result.proposal.slots) {
      expect(Date.parse(slot.start)).toBeGreaterThanOrEqual(Date.parse(SLOTS[0]!.end));
    }
    await expect(ports.tasks.get("user_1", "task_1")).resolves.toMatchObject({ status: "proposed", bookingId: null });
    await expect(ports.proposals.get("user_1", "task_1")).resolves.toMatchObject({ taskId: "task_1" });
  });

  it("on a non-conflict calendar failure, rolls back to proposed and rethrows the original error", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await setUpProposedTask(ports);
    class BoomError extends Error {}
    const boom = new BoomError("calendar is down");
    const failingCalendar: CalendarPort = {
      getBusyIntervals: async () => [],
      getBlock: async () => null,
      createBlock: async () => {
        throw boom;
      },
      updateBlock: async (): Promise<BlockBooking> => {
        throw new Error("not used");
      },
      deleteBlock: async () => {},
    };
    const failingPorts = createTestPersonalFlowPorts(
      { calendar: failingCalendar, settings: ports.settings, tasks: ports.tasks, proposals: ports.proposals },
      NOW,
    );
    const confirmSlot = createConfirmSlot(failingPorts);

    await expect(confirmSlot({ userId: "user_1", taskId: "task_1", slotIndex: 0 })).rejects.toBe(boom);
    await expect(ports.tasks.get("user_1", "task_1")).resolves.toMatchObject({ status: "proposed" });
  });

  it("throws when the source has no chat to notify", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const task = makeTask({ status: "proposed", source: makeSource({ sourceChatId: null }) });
    await ports.tasks.create(task);
    await ports.proposals.save("user_1", {
      taskId: task.id,
      slots: [SLOTS[0]!],
      createdAt: NOW,
      expiresAt: "2026-09-29T06:10:00.000Z",
    });
    const confirmSlot = createConfirmSlot(ports);

    await expect(confirmSlot({ userId: "user_1", taskId: "task_1", slotIndex: 0 })).rejects.toThrow(/chat/i);
  });
});
