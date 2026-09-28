import { describe, expect, it } from "vitest";
import { makeSettings, makeSource, makeTask } from "../../testing/domainFixtures";
import { createTestPersonalFlowPorts } from "../../testing/personalFlowHarness";
import { NotFoundError } from "../index";
import { createAddMeetingDetails } from "./addMeetingDetails";

async function meetingTask(ports: ReturnType<typeof createTestPersonalFlowPorts>, overrides: Record<string, unknown> = {}) {
  const task = makeTask({ id: "meeting_1", kind: "meeting", status: "scheduled", source: makeSource(), ...overrides });
  await ports.tasks.create(task);
  return task;
}

describe("addMeetingDetails", () => {
  it("appends the next message to the meeting description", async () => {
    const ports = createTestPersonalFlowPorts({}, "2026-09-23T08:30:00.000Z");
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    await meetingTask(ports, { description: "Обсудить план запуска" });

    const updated = await createAddMeetingDetails(ports)({ userId: "user_1", taskId: "meeting_1", details: "Мария пришлёт бриф" });

    expect(updated.description).toBe("Обсудить план запуска\n\nМария пришлёт бриф");
  });

  it("starts the description when the meeting has none yet", async () => {
    const ports = createTestPersonalFlowPorts({}, "2026-09-23T08:30:00.000Z");
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    await meetingTask(ports);

    const updated = await createAddMeetingDetails(ports)({ userId: "user_1", taskId: "meeting_1", details: "  Тема: бюджет  " });

    expect(updated.description).toBe("Тема: бюджет");
  });

  it("rejects an empty addition and unknown or non-meeting tasks", async () => {
    const ports = createTestPersonalFlowPorts({}, "2026-09-23T08:30:00.000Z");
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    await meetingTask(ports);
    const addDetails = createAddMeetingDetails(ports);

    await expect(addDetails({ userId: "user_1", taskId: "meeting_1", details: "   " })).rejects.toThrow(/cannot be empty/);
    await expect(addDetails({ userId: "user_1", taskId: "missing", details: "текст" })).rejects.toThrow(NotFoundError);
    await meetingTask(ports, { id: "task_2", kind: "task" });
    await expect(addDetails({ userId: "user_1", taskId: "task_2", details: "текст" })).rejects.toThrow(NotFoundError);
  });
});
