import { describe, expect, it } from "vitest";
import { NotFoundError } from "../index";
import type { Slot, StoredSlotProposal } from "../index";
import { makeSettings, makeTask } from "../../testing/domainFixtures";
import { createTestPersonalFlowPorts } from "../../testing/personalFlowHarness";
import { createNextSlots } from "./nextSlots";

const NOW = "2026-09-28T06:10:00.000Z"; // Monday 09:10 Europe/Moscow

describe("nextSlots", () => {
  it("proposes slots starting after the end of the last offered slot, excluding it", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const task = makeTask({ status: "proposed", deadline: null, durationMinutes: 60 });
    await ports.tasks.create(task);
    const lastSlot: Slot = { start: "2026-09-28T09:30:00.000Z", end: "2026-09-28T10:30:00.000Z" };
    const proposal: StoredSlotProposal = {
      taskId: task.id,
      slots: [lastSlot],
      createdAt: NOW,
      expiresAt: "2026-09-29T06:10:00.000Z",
    };
    await ports.proposals.save("user_1", proposal);
    const nextSlots = createNextSlots(ports);

    const result = await nextSlots({ userId: "user_1", taskId: task.id });

    expect(result.kind).toBe("proposed");
    if (result.kind !== "proposed") throw new Error("expected proposed");
    expect(result.proposal.slots.length).toBeGreaterThan(0);
    for (const slot of result.proposal.slots) {
      expect(Date.parse(slot.start)).toBeGreaterThanOrEqual(Date.parse(lastSlot.end));
      expect(slot).not.toEqual(lastSlot);
    }
    await expect(ports.proposals.get("user_1", task.id)).resolves.toMatchObject({ slots: result.proposal.slots });
  });

  it("returns no_more_slots when nothing is left before the deadline", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const task = makeTask({
      status: "proposed",
      deadline: "2026-09-28T15:00:00.000Z",
      durationMinutes: 60,
    });
    await ports.tasks.create(task);
    const lastSlot: Slot = { start: "2026-09-28T14:00:00.000Z", end: "2026-09-28T15:00:00.000Z" };
    await ports.proposals.save("user_1", {
      taskId: task.id,
      slots: [lastSlot],
      createdAt: NOW,
      expiresAt: "2026-09-29T06:10:00.000Z",
    });
    const nextSlots = createNextSlots(ports);

    const result = await nextSlots({ userId: "user_1", taskId: task.id });

    expect(result.kind).toBe("no_more_slots");
  });

  it("throws NotFoundError when there is no stored proposal", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const task = makeTask({ status: "proposed" });
    await ports.tasks.create(task);
    const nextSlots = createNextSlots(ports);

    await expect(nextSlots({ userId: "user_1", taskId: task.id })).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError for an unknown task", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    const nextSlots = createNextSlots(ports);
    await expect(nextSlots({ userId: "user_1", taskId: "task_missing" })).rejects.toThrow(NotFoundError);
  });
});
