import { describe, expect, it } from "vitest";
import { InvalidSettingsError, InvalidTimezoneError } from "../index";
import { makeSettings, makeSource } from "../../testing/domainFixtures";
import { createTestPersonalFlowPorts } from "../../testing/personalFlowHarness";
import { createSubmitText } from "./submitText";
import {
  createSetBlockLength,
  createSetCalendarConnected,
  createSetNotificationIntensity,
  createSetTimezone,
  createSetWorkingHours,
} from "./updateSettings";

const NOW = "2026-09-28T06:10:00.000Z"; // Monday 09:10 Europe/Moscow

describe("setTimezone", () => {
  it("keeps forwarded date_time hints through timezone confirmation", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: false }));
    const gated = await createSubmitText(ports)({
      userId: "user_1",
      chatId: 1001,
      text: "Посмотри договор до завтра",
      source: makeSource({ sourceType: "forwarded_message" }),
      dateTimeHints: ["2026-10-02T10:15:00.000Z"],
    });
    if (gated.kind !== "timezone_required") throw new Error("expected timezone gate");
    const replayed = await createSetTimezone(ports)({ userId: "user_1", tz: "Europe/Moscow", draftId: gated.draftId });
    if (replayed.kind !== "proposed" && replayed.kind !== "no_slots") throw new Error("expected task");
    expect(replayed.task.deadline).toBe("2026-10-02T10:15:00.000Z");
  });
  it("validates and confirms the timezone", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings({ timezone: "UTC", timezoneConfirmed: false }));
    const setTimezone = createSetTimezone(ports);

    const result = await setTimezone({ userId: "user_1", tz: "europe/moscow" });

    expect(result).toEqual({
      kind: "timezone_set",
      settings: expect.objectContaining({ timezone: "Europe/Moscow", timezoneConfirmed: true }),
    });
  });

  it("rejects an invalid timezone and leaves settings untouched", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: false }));
    const setTimezone = createSetTimezone(ports);

    await expect(setTimezone({ userId: "user_1", tz: "Foo/Bar" })).rejects.toThrow(InvalidTimezoneError);
    await expect(ports.settings.get("user_1")).resolves.toMatchObject({ timezoneConfirmed: false });
  });

  it("replays a timezone-gated draft through submitText once confirmed", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: false }));
    const submitText = createSubmitText(ports);
    const gated = await submitText({
      userId: "user_1",
      chatId: 1001,
      text: "Нужно до пятницы подготовить презентацию, часа на два",
      source: makeSource(),
    });
    expect(gated.kind).toBe("timezone_required");
    if (gated.kind !== "timezone_required") throw new Error("expected timezone_required");

    const setTimezone = createSetTimezone(ports);
    const result = await setTimezone({ userId: "user_1", tz: "Europe/Moscow", draftId: gated.draftId });

    expect(result.kind).toBe("proposed");
    if (result.kind !== "proposed") throw new Error("expected proposed");
    expect(result.task.title).toBe("Подготовить презентацию");
    await expect(ports.drafts.get("user_1", gated.draftId)).resolves.toBeNull();
  });

  it("falls back to a bare confirmation when the draft is gone (expired or already used)", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings({ timezoneConfirmed: false }));
    const setTimezone = createSetTimezone(ports);

    const result = await setTimezone({ userId: "user_1", tz: "Europe/Moscow", draftId: "draft_missing" });

    expect(result).toEqual({
      kind: "timezone_set",
      settings: expect.objectContaining({ timezoneConfirmed: true }),
    });
  });
});

describe("setNotificationIntensity", () => {
  it("updates the setting", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings());
    const setNotificationIntensity = createSetNotificationIntensity(ports);

    await expect(setNotificationIntensity({ userId: "user_1", intensity: "high" })).resolves.toMatchObject({
      notificationIntensity: "high",
    });
  });

  it("rejects an unknown intensity", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings());
    const setNotificationIntensity = createSetNotificationIntensity(ports);

    await expect(setNotificationIntensity({ userId: "user_1", intensity: "loud" })).rejects.toThrow(
      InvalidSettingsError,
    );
  });
});

describe("setBlockLength", () => {
  it.each([15, 30, 240])("accepts %s minutes", async (minutes) => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings());
    const setBlockLength = createSetBlockLength(ports);
    await expect(setBlockLength({ userId: "user_1", minutes })).resolves.toMatchObject({
      defaultBlockMinutes: minutes,
    });
  });

  it.each([10, 245, 32, 0, -15])("rejects %s minutes", async (minutes) => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings());
    const setBlockLength = createSetBlockLength(ports);
    await expect(setBlockLength({ userId: "user_1", minutes })).rejects.toThrow(InvalidSettingsError);
  });
});

describe("setWorkingHours", () => {
  it("parses an explicit dash time range with a day range", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings());
    const setWorkingHours = createSetWorkingHours(ports);

    const result = await setWorkingHours({ userId: "user_1", text: "09:00–18:00 пн–пт" });

    expect(result.workingHours).toEqual({ isoDays: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" });
  });

  it("parses 'с X до Y' bare hours and keeps the current days", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings({ workingHours: { isoDays: [2, 4], start: "08:00", end: "16:00" } }));
    const setWorkingHours = createSetWorkingHours(ports);

    const result = await setWorkingHours({ userId: "user_1", text: "с 10 до 19" });

    expect(result.workingHours).toEqual({ isoDays: [2, 4], start: "10:00", end: "19:00" });
  });

  it("parses a comma-separated day list", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings());
    const setWorkingHours = createSetWorkingHours(ports);

    const result = await setWorkingHours({ userId: "user_1", text: "10:00-15:00 пн, ср, пт" });

    expect(result.workingHours.isoDays).toEqual([1, 3, 5]);
  });

  it("rejects text with no recognizable time range", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings());
    const setWorkingHours = createSetWorkingHours(ports);

    await expect(setWorkingHours({ userId: "user_1", text: "как обычно" })).rejects.toThrow(InvalidSettingsError);
  });

  it("rejects a reversed range once validated on upsert", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings());
    const setWorkingHours = createSetWorkingHours(ports);

    await expect(setWorkingHours({ userId: "user_1", text: "18:00-09:00" })).rejects.toThrow(InvalidSettingsError);
  });
});

describe("setCalendarConnected", () => {
  it("flips the flag", async () => {
    const ports = createTestPersonalFlowPorts({}, NOW);
    await ports.settings.upsert(makeSettings({ calendarConnected: false }));
    const setCalendarConnected = createSetCalendarConnected(ports);

    await expect(setCalendarConnected({ userId: "user_1", connected: true })).resolves.toMatchObject({
      calendarConnected: true,
    });
  });
});
