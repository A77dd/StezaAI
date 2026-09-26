import { MemoryNotConfirmedError } from "../domain";
import type { MemoryRecord, MemoryRepository } from "../domain";

/**
 * In-memory store for user-confirmed memory records (AGENTS.md: meaningful
 * inferred memory needs explicit confirmation before durable storage).
 */
export function createInMemoryMemoryRepository(): MemoryRepository {
  const recordsByUser = new Map<string, MemoryRecord[]>();
  return {
    async record(userId, record) {
      // The type says `true`; this guards untyped callers (JSON, casts).
      if (record.confirmedByUser !== true) {
        throw new MemoryNotConfirmedError("Memory records must be confirmed by the user before storage");
      }
      recordsByUser.set(userId, [...(recordsByUser.get(userId) ?? []), structuredClone(record)]);
    },
    async listByUser(userId) {
      return (recordsByUser.get(userId) ?? []).map((record) => structuredClone(record));
    },
    async deleteAllForUser(userId) {
      const removed = recordsByUser.get(userId)?.length ?? 0;
      recordsByUser.delete(userId);
      return removed;
    },
  };
}
