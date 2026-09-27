import { describe, expect, it } from "vitest";
import { toZonedParts } from "../index";
import type { Intent, IntentParser } from "../index";
import { makeSettings, makeSource } from "../../testing/domainFixtures";
import { createTestPersonalFlowPorts } from "../../testing/personalFlowHarness";
import { createSubmitText } from "./submitText";

const MONDAY_MORNING = "2026-09-28T06:10:00.000Z"; // Monday 09:10 Europe/Moscow

function stubParser(intent: Intent): IntentParser {
  return { parse: async () => intent };
}

describe("submitText", () => {
  it("gates on timezone confirmation and saves the raw text as a draft", async () => {
    const ports = createTestPersonalFlowPorts({}, MONDAY_MORNING);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: false }));
    const submitText = createSubmitText(ports);

    const result = await submitText({
      userId: "user_1",
      chatId: 1001,
      text: "Нужно до пятницы подготовить презентацию, часа на два",
      source: makeSource(),
    });

    expect(result.kind).toBe("timezone_required");
    if (result.kind !== "timezone_required") throw new Error("expected timezone_required");
    const draft = await ports.drafts.get("user_1", result.draftId);
    expect(draft).toMatchObject({
      kind: "timezone",
      intent: null,
      source: { sourceText: "Нужно до пятницы подготовить презентацию, часа на два" },
    });
  });

  it("throws if settings were never initialized", async () => {
    const ports = createTestPersonalFlowPorts();
    const submitText = createSubmitText(ports);
    await expect(
      submitText({ userId: "user_1", chatId: 1001, text: "Нужно", source: makeSource() }),
    ).rejects.toThrow(/settings/i);
  });

  it("reports InvalidIntentError as a typed 'unparseable' result", async () => {
    const ports = createTestPersonalFlowPorts({}, MONDAY_MORNING);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const submitText = createSubmitText(ports);

    const result = await submitText({ userId: "user_1", chatId: 1001, text: "   ", source: makeSource() });

    expect(result).toEqual({ kind: "unparseable", reason: expect.stringContaining("empty") });
  });

  it("offers to remember an info-classified message instead of asking to clarify", async () => {
    const ports = createTestPersonalFlowPorts({}, MONDAY_MORNING);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const submitText = createSubmitText(ports);

    const result = await submitText({
      userId: "user_1",
      chatId: 1001,
      text: "Кстати, отчет за август уже готов",
      source: makeSource(),
    });

    expect(result.kind).toBe("info_only");
    if (result.kind !== "info_only") throw new Error("expected info_only");
    await expect(ports.drafts.get("user_1", result.draftId)).resolves.toMatchObject({ kind: "intent" });
    await expect(ports.tasks.listByUser("user_1")).resolves.toEqual([]);
  });

  it("asks for clarification when the parser is unsure (a real LLM parser may return this)", async () => {
    const ports = createTestPersonalFlowPorts(
      {
        intentParser: stubParser({
          kind: "task",
          title: "Что-то важное",
          deadline: null,
          durationMinutes: null,
          priority: "normal",
          participants: [],
          confidence: 0.4,
        }),
      },
      MONDAY_MORNING,
    );
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const submitText = createSubmitText(ports);

    const result = await submitText({ userId: "user_1", chatId: 1001, text: "хм", source: makeSource() });

    expect(result.kind).toBe("needs_clarification");
    if (result.kind !== "needs_clarification") throw new Error("expected needs_clarification");
    expect(result.intent.title).toBe("Что-то важное");
    await expect(ports.drafts.get("user_1", result.draftId)).resolves.toMatchObject({ kind: "clarify" });
    await expect(ports.tasks.listByUser("user_1")).resolves.toEqual([]);
  });

  it("proposes up to 3 slots that respect working hours and the deadline (the product scenario)", async () => {
    const ports = createTestPersonalFlowPorts({}, MONDAY_MORNING);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const submitText = createSubmitText(ports);

    const result = await submitText({
      userId: "user_1",
      chatId: 1001,
      text: "Нужно до пятницы подготовить презентацию, часа на два",
      source: makeSource(),
    });

    expect(result.kind).toBe("proposed");
    if (result.kind !== "proposed") throw new Error("expected proposed");
    expect(result.task).toMatchObject({
      title: "Подготовить презентацию",
      kind: "task",
      durationMinutes: 120,
      status: "proposed",
    });
    expect(result.task.deadline).not.toBeNull();
    expect(result.proposal.slots.length).toBeGreaterThan(0);
    expect(result.proposal.slots.length).toBeLessThanOrEqual(3);

    for (const slot of result.proposal.slots) {
      const start = toZonedParts(slot.start, "Europe/Moscow");
      const end = toZonedParts(slot.end, "Europe/Moscow");
      expect([1, 2, 3, 4, 5]).toContain(start.isoWeekday);
      expect(start.hour * 60 + start.minute).toBeGreaterThanOrEqual(9 * 60);
      expect(end.hour * 60 + end.minute).toBeLessThanOrEqual(18 * 60);
      expect(Date.parse(slot.end)).toBeLessThanOrEqual(Date.parse(result.task.deadline as string));
    }

    await expect(ports.proposals.get("user_1", result.task.id)).resolves.toMatchObject({
      taskId: result.task.id,
      slots: result.proposal.slots,
    });
  });

  it("returns no_slots with a reason when the deadline leaves no room, and keeps the task in inbox", async () => {
    const ports = createTestPersonalFlowPorts({}, MONDAY_MORNING);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const submitText = createSubmitText(ports);

    const result = await submitText({
      userId: "user_1",
      chatId: 1001,
      text: "Нужно сегодня подготовить презентацию на 10 часов",
      source: makeSource(),
    });

    expect(result.kind).toBe("no_slots");
    if (result.kind !== "no_slots") throw new Error("expected no_slots");
    expect(result.task.status).toBe("inbox");
    expect(result.search.exhausted).toBe("none_before_deadline");
    await expect(ports.proposals.get("user_1", result.task.id)).resolves.toBeNull();
  });
});
