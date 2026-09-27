import { describe, expect, it } from "vitest";
import { makeSettings, makeSource, makeTask } from "../../testing/domainFixtures";
import { createTestPersonalFlowPorts } from "../../testing/personalFlowHarness";
import type { StoredSlotProposal } from "../index";
import { createConfirmSlot } from "./confirmSlot";
import { EXPORT_SCHEMA_VERSION, createExportUserData } from "./exportUserData";

const NOW = "2026-09-28T06:10:00.000Z";

describe("exportUserData", () => {
  it("returns a versioned, JSON-safe snapshot of everything the user owns", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const task = makeTask({ status: "proposed", source: makeSource({ sourceChatId: 1001, sourceText: "оригинал" }) });
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

    const exportUserData = createExportUserData(ports);
    const data = await exportUserData({ userId: "user_1" });

    expect(data.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(data.generatedAt).toBe(NOW);
    expect(data.settings).toMatchObject({ timezoneConfirmed: true });
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0]?.source.sourceText).toBe("оригинал");
    expect(data.bookings).toEqual([booked.booking]);
    expect(data.reminders).toHaveLength(2);
    expect(data.memory).toEqual([]);
    expect(() => JSON.stringify(data)).not.toThrow();
  });

  it("returns null settings and empty collections for a user who never started", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    const exportUserData = createExportUserData(ports);

    const data = await exportUserData({ userId: "user_ghost" });

    expect(data).toMatchObject({
      settings: null,
      tasks: [],
      bookings: [],
      memory: [],
      reminders: [],
    });
  });
});
