import { describe, expect, it } from "vitest";
import { NotFoundError } from "../index";
import type { StoredSlotProposal } from "../index";
import { makeSettings, makeSource, makeTask } from "../../testing/domainFixtures";
import { createTestPersonalFlowPorts } from "../../testing/personalFlowHarness";
import { createCancelTask } from "./cancelTask";
import { createConfirmSlot } from "./confirmSlot";

const NOW = "2026-09-28T06:10:00.000Z";

describe("cancelTask", () => {
  it("cancels a scheduled task: deletes the booking, cancels reminders, and marks it cancelled", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const task = makeTask({ status: "proposed", source: makeSource({ sourceChatId: 1001 }) });
    await ports.tasks.create(task);
    const proposal: StoredSlotProposal = {
      taskId: task.id,
      slots: [{ start: "2026-09-28T09:30:00.000Z", end: "2026-09-28T10:30:00.000Z" }],
      createdAt: NOW,
      expiresAt: "2026-09-29T06:10:00.000Z",
    };
    await ports.proposals.save("user_1", proposal);
    const booked = await createConfirmSlot(ports)({
      userId: "user_1", taskId: task.id, slotIndex: 0,
      slotStart: "2026-09-28T09:30:00.000Z", slotEnd: "2026-09-28T10:30:00.000Z",
    });
    if (booked.kind !== "booked") throw new Error("expected booked");

    const result = await createCancelTask(ports)({ userId: "user_1", taskId: task.id });

    expect(result.kind).toBe("cancelled");
    if (result.kind !== "cancelled") throw new Error("expected cancelled");
    expect(result.task).toMatchObject({ status: "cancelled", bookingId: null });
    await expect(ports.calendar.getBlock("user_1", booked.booking.id)).resolves.toBeNull();
    const reminders = await ports.reminders.exportForUser("user_1");
    expect(reminders.every((reminder) => reminder.status === "cancelled")).toBe(true);
  });

  it("cancels a proposed (not yet scheduled) task and clears its proposal", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    const task = makeTask({ status: "proposed" });
    await ports.tasks.create(task);
    await ports.proposals.save("user_1", {
      taskId: task.id,
      slots: [{ start: "2026-09-28T09:30:00.000Z", end: "2026-09-28T10:30:00.000Z" }],
      createdAt: NOW,
      expiresAt: "2026-09-29T06:10:00.000Z",
    });

    const result = await createCancelTask(ports)({ userId: "user_1", taskId: task.id });

    expect(result.kind).toBe("cancelled");
    await expect(ports.proposals.get("user_1", task.id)).resolves.toBeNull();
  });

  it("is idempotent: cancelling twice reports already_cancelled the second time", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    const task = makeTask({ status: "inbox" });
    await ports.tasks.create(task);
    const cancelTask = createCancelTask(ports);

    await expect(cancelTask({ userId: "user_1", taskId: task.id })).resolves.toMatchObject({ kind: "cancelled" });
    await expect(cancelTask({ userId: "user_1", taskId: task.id })).resolves.toMatchObject({
      kind: "already_cancelled",
    });
  });

  it("throws NotFoundError for an unknown task or one owned by another user", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    const task = makeTask({ userId: "user_1" });
    await ports.tasks.create(task);
    const cancelTask = createCancelTask(ports);

    await expect(cancelTask({ userId: "user_1", taskId: "task_missing" })).rejects.toThrow(NotFoundError);
    await expect(cancelTask({ userId: "user_2", taskId: task.id })).rejects.toThrow(NotFoundError);
  });
});
