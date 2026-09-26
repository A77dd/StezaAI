import { normalizeSettings } from "../domain";
import type { SettingsRepository, UserSettings } from "../domain";

/**
 * In-memory settings store. `get` returns `null` for unknown users: defaults
 * are never applied implicitly (see `createDefaultSettings`).
 */
export function createInMemorySettingsRepository(): SettingsRepository {
  const settingsByUser = new Map<string, UserSettings>();
  return {
    async get(userId) {
      const settings = settingsByUser.get(userId);
      return settings === undefined ? null : structuredClone(settings);
    },
    async upsert(settings) {
      // The canonical timezone name is stored, not the caller's spelling.
      const normalized = normalizeSettings(settings);
      settingsByUser.set(normalized.userId, normalized);
      return structuredClone(normalized);
    },
    async delete(userId) {
      settingsByUser.delete(userId);
    },
  };
}
