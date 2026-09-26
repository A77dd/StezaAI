import { describe, expect, it } from "vitest";
import {
  createDefaultSettings,
  InvalidSettingsError,
  InvalidTimezoneError,
} from "../../domain";
import type { SettingsRepository } from "../../domain";
import { makeSettings } from "../domainFixtures";
import { useSubject } from "./harness";
import type { ContractFactory } from "./harness";

export function describeSettingsRepositoryContract(
  name: string,
  factory: ContractFactory<SettingsRepository>,
): void {
  describe(`${name} satisfies the SettingsRepository contract`, () => {
    const repo = useSubject(factory);

    it("returns null for an unknown user instead of inventing defaults", async () => {
      await expect(repo().get("user_1")).resolves.toBeNull();
    });

    it("stores and reads back settings, and upsert replaces them", async () => {
      const settings = makeSettings();
      await expect(repo().upsert(settings)).resolves.toEqual(settings);
      await expect(repo().get("user_1")).resolves.toEqual(settings);

      const changed = makeSettings({ timezone: "Europe/Berlin", notificationIntensity: "low" });
      await repo().upsert(changed);
      await expect(repo().get("user_1")).resolves.toEqual(changed);
    });

    it("keeps users apart", async () => {
      await repo().upsert(makeSettings({ userId: "user_1", timezone: "Europe/Moscow" }));
      await repo().upsert(makeSettings({ userId: "user_2", timezone: "Europe/Berlin" }));
      await expect(repo().get("user_1")).resolves.toMatchObject({ timezone: "Europe/Moscow" });
      await expect(repo().get("user_2")).resolves.toMatchObject({ timezone: "Europe/Berlin" });
    });

    it("accepts explicit defaults from createDefaultSettings", async () => {
      await repo().upsert(createDefaultSettings("user_2", "en"));
      await expect(repo().get("user_2")).resolves.toMatchObject({ locale: "en", timezone: "UTC" });
    });

    it("stores the canonical timezone name", async () => {
      const stored = await repo().upsert(makeSettings({ timezone: "europe/moscow" }));
      expect(stored.timezone).toBe("Europe/Moscow");
      await expect(repo().get("user_1")).resolves.toMatchObject({ timezone: "Europe/Moscow" });
    });

    it("validates on upsert and stores nothing when invalid", async () => {
      await expect(repo().upsert(makeSettings({ timezone: "Foo/Bar" }))).rejects.toThrow(
        InvalidTimezoneError,
      );
      await expect(repo().upsert(makeSettings({ timezone: "+03:00" }))).rejects.toThrow(
        InvalidTimezoneError,
      );
      await expect(repo().upsert(makeSettings({ defaultBlockMinutes: 0 }))).rejects.toThrow(
        InvalidSettingsError,
      );
      await expect(repo().get("user_1")).resolves.toBeNull();
    });

    it("an invalid upsert leaves the previous settings in place", async () => {
      await repo().upsert(makeSettings());
      await expect(repo().upsert(makeSettings({ timezone: "Foo/Bar" }))).rejects.toThrow();
      await expect(repo().get("user_1")).resolves.toEqual(makeSettings());
    });

    it("deletes settings, and deleting missing settings is a no-op", async () => {
      await repo().upsert(makeSettings());
      await repo().delete("user_1");
      await expect(repo().get("user_1")).resolves.toBeNull();
      await expect(repo().delete("user_1")).resolves.toBeUndefined();
    });

    it("returns copies: mutating results or inputs never changes stored state", async () => {
      const input = makeSettings();
      const upserted = await repo().upsert(input);
      (input.workingHours.isoDays as number[]).push(6);
      (upserted.workingHours.isoDays as number[]).push(7);
      const fetched = await repo().get("user_1");
      (fetched?.workingHours.isoDays as number[]).length = 0;

      await expect(repo().get("user_1")).resolves.toEqual(makeSettings());
    });
  });
}
