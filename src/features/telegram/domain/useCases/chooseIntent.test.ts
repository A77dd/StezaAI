import { describe, expect, it } from "vitest";
import { InvalidIntentError } from "../index";
import { makeSettings, makeSource } from "../../testing/domainFixtures";
import { createTestPersonalFlowPorts } from "../../testing/personalFlowHarness";
import { createChooseIntent } from "./chooseIntent";
import { createSubmitText } from "./submitText";

const MONDAY_MORNING = "2026-09-28T06:10:00.000Z";

describe("chooseIntent", () => {
  it("returns draft_not_found for an unknown or expired draft", async () => {
    const ports = createTestPersonalFlowPorts({}, MONDAY_MORNING);
    const chooseIntent = createChooseIntent(ports);

    await expect(chooseIntent({ userId: "user_1", draftId: "draft_missing", kind: "task" })).resolves.toEqual({
      kind: "draft_not_found",
    });
  });

  it("resolving as 'info' notes it without persisting anything, and deletes the draft", async () => {
    const ports = createTestPersonalFlowPorts({}, MONDAY_MORNING);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const submitText = createSubmitText(ports);
    const clarify = await submitText({
      userId: "user_1",
      chatId: 1001,
      text: "хм, что-то там",
      source: makeSource(),
    });
    // Force a clarify draft directly, since the rule-based parser only produces
    // low confidence for "info" (handled separately as info_only).
    expect(clarify.kind).toBe("info_only");

    const draft = await ports.drafts.save({
      id: "draft_test",
      userId: "user_1",
      chatId: 1001,
      intent: {
        kind: "info",
        title: "Что-то там",
        deadline: null,
        durationMinutes: null,
        priority: "normal",
        participants: [],
        confidence: 0.3,
      },
      source: makeSource(),
      createdAt: MONDAY_MORNING,
      expiresAt: "2026-09-29T06:10:00.000Z",
      kind: "clarify",
    });

    const chooseIntent = createChooseIntent(ports);
    const result = await chooseIntent({ userId: "user_1", draftId: draft.id, kind: "info" });

    expect(result).toEqual({ kind: "noted" });
    await expect(ports.drafts.get("user_1", draft.id)).resolves.toBeNull();
    await expect(ports.tasks.listByUser("user_1")).resolves.toEqual([]);
    await expect(ports.memory.listByUser("user_1")).resolves.toEqual([]);
  });

  it("builds a task from the draft with the chosen kind and proposes slots", async () => {
    const ports = createTestPersonalFlowPorts({}, MONDAY_MORNING);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: true }));
    const draft = await ports.drafts.save({
      id: "draft_1",
      userId: "user_1",
      chatId: 1001,
      intent: {
        kind: "info",
        title: "Обсудить бюджет",
        deadline: null,
        durationMinutes: null,
        priority: "normal",
        participants: [],
        confidence: 0.3,
      },
      source: makeSource({ sourceText: "Обсудить бюджет" }),
      createdAt: MONDAY_MORNING,
      expiresAt: "2026-09-29T06:10:00.000Z",
      kind: "intent",
    });

    const chooseIntent = createChooseIntent(ports);
    const result = await chooseIntent({ userId: "user_1", draftId: draft.id, kind: "meeting" });

    expect(result.kind).toBe("proposed");
    if (result.kind !== "proposed") throw new Error("expected proposed");
    expect(result.task).toMatchObject({ title: "Обсудить бюджет", kind: "meeting", status: "proposed" });
    expect(result.proposal.slots.length).toBeGreaterThan(0);
    await expect(ports.drafts.get("user_1", draft.id)).resolves.toBeNull();
  });

  it("throws InvalidIntentError when the draft has no parsed intent (e.g. a timezone draft)", async () => {
    const ports = createTestPersonalFlowPorts({}, MONDAY_MORNING);
    await ports.drafts.save({
      id: "draft_tz",
      userId: "user_1",
      chatId: 1001,
      intent: null,
      source: makeSource(),
      createdAt: MONDAY_MORNING,
      expiresAt: "2026-09-29T06:10:00.000Z",
      kind: "timezone",
    });
    const chooseIntent = createChooseIntent(ports);

    await expect(chooseIntent({ userId: "user_1", draftId: "draft_tz", kind: "task" })).rejects.toThrow(
      InvalidIntentError,
    );
  });

  it("does not let user_2 resolve user_1's draft", async () => {
    const ports = createTestPersonalFlowPorts({}, MONDAY_MORNING);
    await ports.drafts.save({
      id: "draft_1",
      userId: "user_1",
      chatId: 1001,
      intent: {
        kind: "info",
        title: "Что-то",
        deadline: null,
        durationMinutes: null,
        priority: "normal",
        participants: [],
        confidence: 0.3,
      },
      source: makeSource(),
      createdAt: MONDAY_MORNING,
      expiresAt: "2026-09-29T06:10:00.000Z",
      kind: "intent",
    });
    const chooseIntent = createChooseIntent(ports);

    await expect(chooseIntent({ userId: "user_2", draftId: "draft_1", kind: "info" })).resolves.toEqual({
      kind: "draft_not_found",
    });
  });
});
