import { describe, expect, it } from "vitest";
import { createDefaultSettings, InvalidSettingsError, InvalidTimezoneError } from "../domain";
import { makeSettings } from "../testing/domainFixtures";
import { createInMemorySettingsRepository } from "./inMemorySettingsRepository";

describe("inMemorySettingsRepository", () => {
  it("returns null for an unknown user instead of inventing defaults", async () => {
    await expect(createInMemorySettingsRepository().get("user_1")).resolves.toBeNull();
  });

  it("stores and reads back settings, and upsert replaces them", async () => {
    const repo = createInMemorySettingsRepository();
    const settings = makeSettings();
    await expect(repo.upsert(settings)).resolves.toEqual(settings);
    await expect(repo.get("user_1")).resolves.toEqual(settings);

    const changed = makeSettings({ timezone: "Europe/Berlin", notificationIntensity: "low" });
    await repo.upsert(changed);
    await expect(repo.get("user_1")).resolves.toEqual(changed);
  });

  it("accepts explicit defaults from createDefaultSettings", async () => {
    const repo = createInMemorySettingsRepository();
    await repo.upsert(createDefaultSettings("user_2", "en"));
    await expect(repo.get("user_2")).resolves.toMatchObject({ locale: "en", timezone: "UTC" });
  });

  it("validates on upsert and stores nothing when invalid", async () => {
    const repo = createInMemorySettingsRepository();
    await expect(repo.upsert(makeSettings({ timezone: "Foo/Bar" }))).rejects.toThrow(
      InvalidTimezoneError,
    );
    await expect(repo.upsert(makeSettings({ defaultBlockMinutes: 0 }))).rejects.toThrow(
      InvalidSettingsError,
    );
    await expect(repo.get("user_1")).resolves.toBeNull();
  });

  it("deletes settings, and deleting missing settings is a no-op", async () => {
    const repo = createInMemorySettingsRepository();
    await repo.upsert(makeSettings());
    await repo.delete("user_1");
    await expect(repo.get("user_1")).resolves.toBeNull();
    await expect(repo.delete("user_1")).resolves.toBeUndefined();
  });

  it("returns copies: mutating results or inputs never changes stored state", async () => {
    const repo = createInMemorySettingsRepository();
    const input = makeSettings();
    const upserted = await repo.upsert(input);
    (input.workingHours.isoDays as number[]).push(6);
    (upserted.workingHours.isoDays as number[]).push(7);
    const fetched = await repo.get("user_1");
    (fetched?.workingHours.isoDays as number[]).length = 0;

    await expect(repo.get("user_1")).resolves.toEqual(makeSettings());
  });
});
