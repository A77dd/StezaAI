import { describe, expect, it } from "vitest";
import { InvalidTransitionError, NotFoundError } from "../index";
import type { StoredSlotProposal } from "../index";
import { makeSettings, makeSource, makeTask } from "../../testing/domainFixtures";
import { createTestPersonalFlowPorts } from "../../testing/personalFlowHarness";
import { createConfirmSlot } from "./confirmSlot";
import { createApplyTaskEdit, createBeginTaskEdit } from "./taskEdit";

const NOW = "2026-09-28T06:10:00.000Z"; // Monday 09:10 Europe/Moscow

describe("beginTaskEdit", () => {
  it("saves a pending input for the prompt", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    const task = makeTask();
    await ports.tasks.create(task);
    const beginTaskEdit = createBeginTaskEdit(ports);

    const result = await beginTaskEdit({ userId: "user_1", chatId: 1001, taskId: task.id, promptMessageId: 55 });

    expect(result).toEqual({ kind: "awaiting_input" });
    await expect(ports.pendingInputs.takeByPrompt("user_1", 1001, 55)).resolves.toMatchObject({
      purpose: "task_edit",
      refId: task.id,
    });
  });

  it("throws NotFoundError for an unknown task", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    const beginTaskEdit = createBeginTaskEdit(ports);
    await expect(
      beginTaskEdit({ userId: "user_1", chatId: 1001, taskId: "task_missing", promptMessageId: 1 }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("applyTaskEdit", () => {
  it("returns no_pending_edit when there is nothing pending for that prompt", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    const applyTaskEdit = createApplyTaskEdit(ports);

    const result = await applyTaskEdit({ userId: "user_1", chatId: 1001, promptMessageId: 99, text: "завтра" });

    expect(result).toEqual({ kind: "no_pending_edit" });
  });

  it("returns nothing_changed when the text carries no recognizable override", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const task = makeTask({ status: "proposed", title: "Подготовить презентацию" });
    await ports.tasks.create(task);
    const beginTaskEdit = createBeginTaskEdit(ports);
    await beginTaskEdit({ userId: "user_1", chatId: 1001, taskId: task.id, promptMessageId: 55 });
    const applyTaskEdit = createApplyTaskEdit(ports);

    const result = await applyTaskEdit({ userId: "user_1", chatId: 1001, promptMessageId: 55, text: "ладно" });

    expect(result.kind).toBe("nothing_changed");
    await expect(ports.tasks.get("user_1", task.id)).resolves.toMatchObject({ title: "Подготовить презентацию" });
    // Single-use: a second attempt with the same prompt finds nothing pending.
    await expect(
      applyTaskEdit({ userId: "user_1", chatId: 1001, promptMessageId: 55, text: "завтра" }),
    ).resolves.toEqual({ kind: "no_pending_edit" });
  });

  it("applies a recognized deadline/duration/priority override and re-proposes", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const task = makeTask({ status: "proposed", deadline: null, durationMinutes: 30, priority: "normal" });
    await ports.tasks.create(task);
    const beginTaskEdit = createBeginTaskEdit(ports);
    await beginTaskEdit({ userId: "user_1", chatId: 1001, taskId: task.id, promptMessageId: 55 });
    const applyTaskEdit = createApplyTaskEdit(ports);

    const result = await applyTaskEdit({
      userId: "user_1",
      chatId: 1001,
      promptMessageId: 55,
      text: "нужно до пятницы, на 2 часа, срочно",
    });

    expect(result.kind).toBe("proposed");
    if (result.kind !== "proposed") throw new Error("expected proposed");
    expect(result.task).toMatchObject({ durationMinutes: 120, priority: "high" });
    expect(result.task.deadline).not.toBeNull();
  });

  it("cancels the booking and reminders of a scheduled task, then re-proposes", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const task = makeTask({ status: "proposed", source: makeSource({ sourceChatId: 1001 }), durationMinutes: 60 });
    await ports.tasks.create(task);
    const proposal: StoredSlotProposal = {
      taskId: task.id,
      slots: [{ start: "2026-09-28T09:30:00.000Z", end: "2026-09-28T10:30:00.000Z" }],
      createdAt: NOW,
      expiresAt: "2026-09-29T06:10:00.000Z",
    };
    await ports.proposals.save("user_1", proposal);
    const confirmSlot = createConfirmSlot(ports);
    const booked = await confirmSlot({
      userId: "user_1", taskId: task.id, slotIndex: 0,
      slotStart: "2026-09-28T09:30:00.000Z", slotEnd: "2026-09-28T10:30:00.000Z",
    });
    expect(booked.kind).toBe("booked");

    const beginTaskEdit = createBeginTaskEdit(ports);
    await beginTaskEdit({ userId: "user_1", chatId: 1001, taskId: task.id, promptMessageId: 77 });
    const applyTaskEdit = createApplyTaskEdit(ports);

    const result = await applyTaskEdit({
      userId: "user_1",
      chatId: 1001,
      promptMessageId: 77,
      text: "на самом деле нужно 3 часа",
    });

    expect(result.kind).toBe("proposed");
    if (result.kind !== "proposed") throw new Error("expected proposed");
    expect(result.task).toMatchObject({ status: "proposed", bookingId: null, durationMinutes: 180 });
    const reminders = await ports.reminders.exportForUser("user_1");
    expect(reminders.every((reminder) => reminder.status === "cancelled")).toBe(true);
    if (booked.kind === "booked") {
      await expect(ports.calendar.getBlock("user_1", booked.booking.id)).resolves.toBeNull();
    }
  });

  it("throws InvalidTransitionError when editing a cancelled task", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const task = makeTask({ status: "cancelled" });
    await ports.tasks.create(task);
    const beginTaskEdit = createBeginTaskEdit(ports);
    await beginTaskEdit({ userId: "user_1", chatId: 1001, taskId: task.id, promptMessageId: 1 });
    const applyTaskEdit = createApplyTaskEdit(ports);

    await expect(
      applyTaskEdit({ userId: "user_1", chatId: 1001, promptMessageId: 1, text: "завтра" }),
    ).rejects.toThrow(InvalidTransitionError);
  });
});
