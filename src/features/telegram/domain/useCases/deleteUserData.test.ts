import { describe, expect, it } from "vitest";
import { CallbackNotFoundError } from "../../callbacks";
import type { CallbackStore } from "../../callbacks";
import { makeSettings, makeSource, makeTask } from "../../testing/domainFixtures";
import { createTestPersonalFlowPorts } from "../../testing/personalFlowHarness";
import type { StoredSlotProposal } from "../index";
import { createConfirmSlot } from "./confirmSlot";
import { createDeleteUserData } from "./deleteUserData";
import { createExportUserData } from "./exportUserData";

const NOW = "2026-09-28T06:10:00.000Z";

async function setUpRichUser(ports: ReturnType<typeof createTestPersonalFlowPorts>) {
  await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));

  const scheduledTask = makeTask({
    id: "task_scheduled",
    status: "proposed",
    source: makeSource({ sourceChatId: 1001 }),
  });
  await ports.tasks.create(scheduledTask);
  const proposal: StoredSlotProposal = {
    taskId: scheduledTask.id,
    slots: [{ start: "2026-09-28T09:30:00.000Z", end: "2026-09-28T10:30:00.000Z" }],
    createdAt: NOW,
    expiresAt: "2026-09-29T06:10:00.000Z",
  };
  await ports.proposals.save("user_1", proposal);
  const booked = await createConfirmSlot(ports)({
    userId: "user_1", taskId: scheduledTask.id, slotIndex: 0,
    slotStart: "2026-09-28T09:30:00.000Z", slotEnd: "2026-09-28T10:30:00.000Z",
  });
  if (booked.kind !== "booked") throw new Error("expected booked");

  const openTask = makeTask({ id: "task_open", status: "proposed" });
  await ports.tasks.create(openTask);
  await ports.proposals.save("user_1", {
    taskId: openTask.id,
    slots: [{ start: "2026-09-29T09:30:00.000Z", end: "2026-09-29T10:30:00.000Z" }],
    createdAt: NOW,
    expiresAt: "2026-09-30T06:10:00.000Z",
  });

  await ports.drafts.save({
    id: "draft_1",
    userId: "user_1",
    chatId: 1001,
    intent: null,
    source: makeSource(),
    createdAt: NOW,
    expiresAt: "2026-09-29T06:10:00.000Z",
    kind: "timezone",
  });

  await ports.pendingInputs.save({
    userId: "user_1",
    chatId: 1001,
    promptMessageId: 42,
    purpose: "task_edit",
    refId: "task_open",
    expiresAt: "2026-09-28T07:00:00.000Z",
  });

  await ports.memory.record("user_1", {
    id: "memory_1",
    recordedAt: NOW,
    confirmedByUser: true,
    kind: "preferred_block_length",
    minutes: 45,
  });

  const callbackToken = await (ports.callbackTokens as CallbackStore).issue({
    action: "noop",
    userId: "user_1",
    chatId: 1001,
    payload: {},
  });

  return { booked, callbackToken };
}

describe("deleteUserData", () => {
  it("erases everything the user owns and reports accurate counts", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    const { booked, callbackToken } = await setUpRichUser(ports);

    const deleteUserData = createDeleteUserData(ports);
    const counts = await deleteUserData({ userId: "user_1" });

    expect(counts).toEqual({
      tasks: 2,
      bookings: 1,
      proposals: 1, // the scheduled task's proposal was already deleted on booking
      drafts: 1,
      pendingInputs: 1,
      settings: 1,
      memory: 1,
      reminders: 2,
      callbackTokens: 1,
    });

    // Every port handed to createPersonalFlow is empty for this user.
    await expect(ports.tasks.listByUser("user_1")).resolves.toEqual([]);
    await expect(ports.settings.get("user_1")).resolves.toBeNull();
    await expect(ports.drafts.get("user_1", "draft_1")).resolves.toBeNull();
    await expect(ports.proposals.get("user_1", "task_open")).resolves.toBeNull();
  await expect(ports.pendingInputs.consumeByPrompt("user_1", 1001, 42)).resolves.toBeNull();
    await expect(ports.memory.listByUser("user_1")).resolves.toEqual([]);
    await expect(ports.reminders.exportForUser("user_1")).resolves.toEqual([]);
    await expect(ports.calendar.getBlock("user_1", booked.booking.id)).resolves.toBeNull();
    await expect(
      (ports.callbackTokens as CallbackStore).resolve(callbackToken, { userId: "user_1", chatId: 1001 }),
    ).rejects.toThrow(CallbackNotFoundError);

    const exportUserData = createExportUserData(ports);
    await expect(exportUserData({ userId: "user_1" })).resolves.toMatchObject({
      settings: null,
      tasks: [],
      bookings: [],
      memory: [],
      reminders: [],
    });
  });

  it("is idempotent: a second call returns all-zero counts", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await setUpRichUser(ports);
    const deleteUserData = createDeleteUserData(ports);
    await deleteUserData({ userId: "user_1" });

    await expect(deleteUserData({ userId: "user_1" })).resolves.toEqual({
      tasks: 0,
      bookings: 0,
      proposals: 0,
      drafts: 0,
      pendingInputs: 0,
      settings: 0,
      memory: 0,
      reminders: 0,
      callbackTokens: 0,
    });
  });

  it("never touches another user's data", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await setUpRichUser(ports);
    await ports.settings.upsert(makeSettings({ userId: "user_2" }));
    await ports.tasks.create(makeTask({ id: "task_other", userId: "user_2" }));

    await createDeleteUserData(ports)({ userId: "user_1" });

    await expect(ports.settings.get("user_2")).resolves.not.toBeNull();
    await expect(ports.tasks.listByUser("user_2")).resolves.toHaveLength(1);
  });
});
