import { describe, expect, it } from "vitest";
import { NotFoundError } from "../index";
import { makeSettings, makeTask } from "../../testing/domainFixtures";
import { createTestPersonalFlowPorts } from "../../testing/personalFlowHarness";
import { createProposeSlots } from "./proposeSlots";

const MONDAY_MORNING = "2026-09-28T06:10:00.000Z";

describe("proposeSlots", () => {
  it("proposes and persists slots for a task, deterministically", async () => {
    const ports = createTestPersonalFlowPorts({}, MONDAY_MORNING);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const task = makeTask({ deadline: null, durationMinutes: 60 });
    await ports.tasks.create(task);
    const proposeSlots = createProposeSlots(ports);

    const result = await proposeSlots({ userId: "user_1", task });

    expect(result.kind).toBe("proposed");
    if (result.kind !== "proposed") throw new Error("expected proposed");
    expect(result.proposal.taskId).toBe(task.id);
    expect(result.proposal.slots.length).toBeGreaterThan(0);
    await expect(ports.proposals.get("user_1", task.id)).resolves.toMatchObject({
      taskId: task.id,
      slots: result.proposal.slots,
    });
  });

  it("searches from an explicit 'after' instant instead of now", async () => {
    const ports = createTestPersonalFlowPorts({}, MONDAY_MORNING);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const task = makeTask({ deadline: null, durationMinutes: 60 });
    await ports.tasks.create(task);
    const proposeSlots = createProposeSlots(ports);

    const later = await proposeSlots({ userId: "user_1", task, after: "2026-09-30T06:10:00.000Z" });
    expect(later.kind).toBe("proposed");
    if (later.kind !== "proposed") throw new Error("expected proposed");
    for (const slot of later.proposal.slots) {
      expect(Date.parse(slot.start)).toBeGreaterThanOrEqual(Date.parse("2026-09-30T06:10:00.000Z"));
    }
  });

  it("reports 'no_slots' with the exhaustion reason and does not persist a proposal", async () => {
    const ports = createTestPersonalFlowPorts({}, MONDAY_MORNING);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const task = makeTask({ deadline: "2026-09-28T06:10:00.000Z", durationMinutes: 60 });
    await ports.tasks.create(task);
    const proposeSlots = createProposeSlots(ports);

    const result = await proposeSlots({ userId: "user_1", task });

    expect(result).toMatchObject({ kind: "no_slots", search: { exhausted: "none_before_deadline" } });
    await expect(ports.proposals.get("user_1", task.id)).resolves.toBeNull();
  });

  it("rejects a task that does not belong to the caller", async () => {
    const ports = createTestPersonalFlowPorts({}, MONDAY_MORNING);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const task = makeTask({ userId: "user_2" });
    const proposeSlots = createProposeSlots(ports);

    await expect(proposeSlots({ userId: "user_1", task })).rejects.toThrow(NotFoundError);
  });
});
