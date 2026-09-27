import { describe, expect, it } from "vitest";
import { createTestPersonalFlowPorts } from "../../testing/personalFlowHarness";
import { createStartUser } from "./startUser";

describe("startUser", () => {
  it("creates default settings for a new user, timezone unconfirmed", async () => {
    const ports = createTestPersonalFlowPorts();
    const startUser = createStartUser(ports);

    const result = await startUser({ userId: "user_1", locale: "ru" });

    expect(result.isNew).toBe(true);
    expect(result.settings).toMatchObject({
      userId: "user_1",
      locale: "ru",
      timezone: "UTC",
      timezoneConfirmed: false,
    });
    await expect(ports.settings.get("user_1")).resolves.toEqual(result.settings);
  });

  it("is idempotent: a returning user keeps their settings unchanged", async () => {
    const ports = createTestPersonalFlowPorts();
    const startUser = createStartUser(ports);
    await ports.settings.upsert({
      userId: "user_1",
      timezone: "Europe/Moscow",
      timezoneConfirmed: true,
      locale: "ru",
      workingHours: { isoDays: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" },
      defaultBlockMinutes: 45,
      notificationIntensity: "high",
      calendarConnected: false,
    });

    const result = await startUser({ userId: "user_1", locale: "en" });

    expect(result.isNew).toBe(false);
    expect(result.settings).toMatchObject({ timezone: "Europe/Moscow", locale: "ru" });
  });
});
