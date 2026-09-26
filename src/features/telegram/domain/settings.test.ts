import { describe, expect, it } from "vitest";
import { InvalidSettingsError, InvalidTimezoneError } from "./errors";
import { assertValidSettings, createDefaultSettings } from "./settings";

describe("createDefaultSettings", () => {
  it("returns explicit, documented defaults for a user", () => {
    expect(createDefaultSettings("user_1", "ru")).toEqual({
      userId: "user_1",
      timezone: "UTC",
      locale: "ru",
      workingHours: { isoDays: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" },
      defaultBlockMinutes: 30,
      notificationIntensity: "normal",
      calendarConnected: false,
    });
  });

  it("returns a fresh object each call", () => {
    const a = createDefaultSettings("user_1", "ru");
    const b = createDefaultSettings("user_1", "ru");
    expect(a).toEqual(b);
    expect(a.workingHours).not.toBe(b.workingHours);
    expect(a.workingHours.isoDays).not.toBe(b.workingHours.isoDays);
  });

  it("passes its own validation", () => {
    expect(() => assertValidSettings(createDefaultSettings("user_1", "en"))).not.toThrow();
  });
});

describe("assertValidSettings", () => {
  const valid = () => createDefaultSettings("user_1", "ru");

  it("rejects an invalid timezone", () => {
    expect(() => assertValidSettings({ ...valid(), timezone: "Foo/Bar" })).toThrow(
      InvalidTimezoneError,
    );
  });

  it("rejects working hours whose start is not before end", () => {
    const settings = { ...valid(), workingHours: { isoDays: [1], start: "18:00", end: "09:00" } };
    expect(() => assertValidSettings(settings)).toThrow(InvalidSettingsError);
  });

  it("rejects malformed working-hour times", () => {
    const settings = { ...valid(), workingHours: { isoDays: [1], start: "9am", end: "18:00" } };
    expect(() => assertValidSettings(settings)).toThrow();
  });

  it.each([[[0]], [[8]], [[1, 1]], [[1.5]]])("rejects isoDays %j", (isoDays) => {
    const settings = { ...valid(), workingHours: { isoDays, start: "09:00", end: "18:00" } };
    expect(() => assertValidSettings(settings)).toThrow(InvalidSettingsError);
  });

  it.each([0, -30, 30.5, 24 * 60 + 1])("rejects defaultBlockMinutes %s", (minutes) => {
    expect(() => assertValidSettings({ ...valid(), defaultBlockMinutes: minutes })).toThrow(
      InvalidSettingsError,
    );
  });
});
