import { describe, expect, it } from "vitest";
import { makeSource } from "../../testing/domainFixtures";
import { createTestPersonalFlowPorts } from "../../testing/personalFlowHarness";
import { createPersonalFlow } from "./index";

const NOW = "2026-09-28T06:10:00.000Z"; // Monday 09:10 Europe/Moscow

/** A callback_data string (`v1:<action>:<token>`) must never leak into a result. */
const CALLBACK_TOKEN_PATTERN = /^v1:[a-z][a-z.]*:[A-Za-z0-9_-]{8,32}$/;

function assertNoCallbackTokensOrTelegramTypes(value: unknown, seen: Set<unknown> = new Set()): void {
  if (typeof value === "string") {
    expect(CALLBACK_TOKEN_PATTERN.test(value)).toBe(false);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  // Telegram Update/CallbackQuery shapes always carry these; plain domain data never does.
  expect(Object.hasOwn(value, "update_id")).toBe(false);
  expect(Object.hasOwn(value, "callback_query")).toBe(false);
  expect(Object.hasOwn(value, "message_id")).toBe(false);
  for (const entry of Object.values(value as Record<string, unknown>)) {
    assertNoCallbackTokensOrTelegramTypes(entry, seen);
  }
}

describe("createPersonalFlow", () => {
  it("composes every personal-flow use-case", () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    const flow = createPersonalFlow(ports);

    expect(Object.keys(flow).sort()).toEqual(
      [
        "applyTaskEdit",
        "beginTaskEdit",
        "cancelTask",
        "chooseIntent",
        "confirmSlot",
        "deleteUserData",
        "exportUserData",
        "getRetryableProposal",
        "nextSlots",
        "proposeSlots",
        "setBlockLength",
        "setCalendarConnected",
        "setNotificationIntensity",
        "setTimezone",
        "setWorkingHours",
        "startUser",
        "submitText",
      ].sort(),
    );
  });

  it("no result object carries a raw callback token or a Telegram-shaped object", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    const flow = createPersonalFlow(ports);

    const started = await flow.startUser({ userId: "user_1", locale: "ru" });
    assertNoCallbackTokensOrTelegramTypes(started);

    const gated = await flow.submitText({
      userId: "user_1",
      chatId: 1001,
      text: "Нужно позвонить",
      source: makeSource(),
    });
    assertNoCallbackTokensOrTelegramTypes(gated);
    expect(gated.kind).toBe("timezone_required");

    await flow.setTimezone({ userId: "user_1", tz: "Europe/Moscow" });
    const proposed = await flow.submitText({
      userId: "user_1",
      chatId: 1001,
      text: "Нужно до пятницы подготовить презентацию, часа на два",
      source: makeSource(),
    });
    assertNoCallbackTokensOrTelegramTypes(proposed);

    if (proposed.kind === "proposed") {
      const slot = proposed.proposal.slots[0]!;
      const confirmed = await flow.confirmSlot({
        userId: "user_1", taskId: proposed.task.id, slotIndex: 0,
        slotStart: slot.start, slotEnd: slot.end,
      });
      assertNoCallbackTokensOrTelegramTypes(confirmed);
    }

    const exported = await flow.exportUserData({ userId: "user_1" });
    assertNoCallbackTokensOrTelegramTypes(exported);

    const deleted = await flow.deleteUserData({ userId: "user_1" });
    assertNoCallbackTokensOrTelegramTypes(deleted);
  });
});
