import { describe, expect, it } from "vitest";
import { CHECK_IN_REASONS } from "../domain";
import { SAMPLE_CALLBACK_PAYLOADS } from "../testing/callbackFixtures";
import { CALLBACK_ACTIONS } from "./actions";
import type { CallbackAction } from "./actions";

const ACTIONS = Object.keys(CALLBACK_ACTIONS) as CallbackAction[];
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe("CALLBACK_ACTIONS registry", () => {
  it("registers exactly the documented actions", () => {
    expect([...ACTIONS].sort()).toEqual(
      [
        "checkin.answer",
        "checkin.reason",
        "context.choose",
        "intent.choose",
        "noop",
        "settings.toggle",
        "slot.other",
        "slot.pick",
        "task.edit",
      ].sort(),
    );
  });

  it("gives every action a complete config and a sample payload it accepts", () => {
    for (const action of ACTIONS) {
      const config = CALLBACK_ACTIONS[action];
      expect(typeof config.singleUse).toBe("boolean");
      expect(Number.isInteger(config.ttlMs) && config.ttlMs > 0).toBe(true);
      expect(["user", "chat"]).toContain(config.scope);
      expect(config.validate(SAMPLE_CALLBACK_PAYLOADS[action])).toBe(true);
    }
  });

  it.each([
    ["slot.pick", true, DAY_MS, "user"],
    ["slot.other", true, DAY_MS, "user"],
    ["task.edit", false, DAY_MS, "user"],
    ["intent.choose", true, DAY_MS, "user"],
    ["context.choose", true, DAY_MS, "chat"],
    ["checkin.answer", true, 7 * DAY_MS, "user"],
    ["checkin.reason", true, 7 * DAY_MS, "user"],
    ["settings.toggle", false, 30 * DAY_MS, "user"],
    ["noop", false, 30 * DAY_MS, "user"],
  ] as const)("%s: singleUse=%s ttl=%s scope=%s", (action, singleUse, ttlMs, scope) => {
    expect(CALLBACK_ACTIONS[action]).toMatchObject({ singleUse, ttlMs, scope });
  });

  it("is frozen so config cannot be mutated at runtime", () => {
    expect(Object.isFrozen(CALLBACK_ACTIONS)).toBe(true);
  });
});

describe("payload validators", () => {
  const NOT_OBJECTS = [null, undefined, "x", 1, true, [], [{ taskId: "task_1" }]];

  it.each(ACTIONS)("%s rejects non-object values", (action) => {
    for (const value of NOT_OBJECTS) {
      expect(CALLBACK_ACTIONS[action].validate(value)).toBe(false);
    }
  });

  it.each(ACTIONS)("%s rejects payloads with unknown keys", (action) => {
    const extra = { ...SAMPLE_CALLBACK_PAYLOADS[action], admin: true };
    expect(CALLBACK_ACTIONS[action].validate(extra)).toBe(false);
  });

  it("slot.pick accepts slot indexes 0-2 only", () => {
    const { validate } = CALLBACK_ACTIONS["slot.pick"];
    for (const slotIndex of [0, 1, 2]) {
      expect(validate({ taskId: "task_1", slotIndex })).toBe(true);
    }
    for (const slotIndex of [-1, 3, 1.5, "1", null, undefined, Number.NaN]) {
      expect(validate({ taskId: "task_1", slotIndex })).toBe(false);
    }
    expect(validate({ taskId: "task_1" })).toBe(false);
  });

  it.each(["slot.pick", "slot.other", "task.edit"] as const)("%s rejects a missing, empty or non-string taskId", (action) => {
    const base = action === "slot.pick" ? { slotIndex: 0 } : {};
    const { validate } = CALLBACK_ACTIONS[action];
    expect(validate({ ...base, taskId: "task_1" })).toBe(true);
    for (const taskId of [undefined, "", 5, null, {}, "x".repeat(201)]) {
      expect(validate({ ...base, taskId })).toBe(false);
    }
    expect(validate(base)).toBe(false);
  });

  it("intent.choose accepts the five intent kinds", () => {
    const { validate } = CALLBACK_ACTIONS["intent.choose"];
    for (const kind of ["task", "meeting", "reminder", "follow_up", "info"]) {
      expect(validate({ draftId: "draft_1", kind })).toBe(true);
    }
    expect(validate({ draftId: "draft_1", kind: "other" })).toBe(false);
    expect(validate({ draftId: "", kind: "task" })).toBe(false);
    expect(validate({ kind: "task" })).toBe(false);
  });

  it("context.choose accepts personal, group and remember", () => {
    const { validate } = CALLBACK_ACTIONS["context.choose"];
    for (const choice of ["personal", "group", "remember"]) {
      expect(validate({ draftId: "draft_1", choice })).toBe(true);
    }
    expect(validate({ draftId: "draft_1", choice: "both" })).toBe(false);
    expect(validate({ choice: "group" })).toBe(false);
  });

  it("checkin.answer accepts the four outcomes", () => {
    const { validate } = CALLBACK_ACTIONS["checkin.answer"];
    for (const outcome of ["done", "needs_time", "not_started", "blocked"]) {
      expect(validate({ checkInId: "checkin_1", outcome })).toBe(true);
    }
    expect(validate({ checkInId: "checkin_1", outcome: "skipped" })).toBe(false);
    expect(validate({ outcome: "done" })).toBe(false);
  });

  it("checkin.reason accepts exactly the domain CheckInReason values", () => {
    const { validate } = CALLBACK_ACTIONS["checkin.reason"];
    for (const reason of CHECK_IN_REASONS) {
      expect(validate({ checkInId: "checkin_1", reason })).toBe(true);
    }
    expect(validate({ checkInId: "checkin_1", reason: "lazy" })).toBe(false);
    expect(validate({ checkInId: "checkin_1", reason: "toString" })).toBe(false);
  });

  it("settings.toggle accepts the four keys with an optional string value", () => {
    const { validate } = CALLBACK_ACTIONS["settings.toggle"];
    for (const key of ["notification_intensity", "working_hours", "block_length", "calendar"]) {
      expect(validate({ key })).toBe(true);
      expect(validate({ key, value: "x" })).toBe(true);
    }
    expect(validate({ key: "language" })).toBe(false);
    expect(validate({ key: "calendar", value: 1 })).toBe(false);
    expect(validate({ key: "calendar", value: null })).toBe(false);
    expect(validate({})).toBe(false);
  });

  it("noop accepts only the empty object", () => {
    const { validate } = CALLBACK_ACTIONS.noop;
    expect(validate({})).toBe(true);
    expect(validate({ a: 1 })).toBe(false);
    expect(validate(null)).toBe(false);
  });
});
