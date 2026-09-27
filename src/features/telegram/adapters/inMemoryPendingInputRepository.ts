import { parseInstant } from "../domain";
import type { Clock, PendingInput, PendingInputRepository } from "../domain";

export type InMemoryPendingInputRepositoryOptions = {
  readonly clock: Clock;
};

/**
 * In-memory `PendingInputRepository`, one pending input per prompt message.
 * `save` is an upsert on `(userId, chatId, promptMessageId)`.
 * `takeByPrompt` never awaits between reading and removing, so it is safe to
 * call concurrently: the entry is consumed by exactly one caller.
 */
export function createInMemoryPendingInputRepository(
  options: InMemoryPendingInputRepositoryOptions,
): PendingInputRepository {
  const { clock } = options;
  const inputs = new Map<string, PendingInput>();
  const key = (userId: string, chatId: number, promptMessageId: number): string =>
    `${userId}\u0000${chatId}\u0000${promptMessageId}`;

  return {
    async save(input) {
      const stored = structuredClone(input);
      inputs.set(key(stored.userId, stored.chatId, stored.promptMessageId), stored);
      return structuredClone(stored);
    },

    async takeByPrompt(userId, chatId, promptMessageId) {
      const mapKey = key(userId, chatId, promptMessageId);
      const input = inputs.get(mapKey);
      if (input === undefined || input.userId !== userId) return null;
      inputs.delete(mapKey);
      return parseInstant(input.expiresAt) <= parseInstant(clock.now()) ? null : structuredClone(input);
    },

    async deleteAllForUser(userId) {
      let removed = 0;
      for (const [mapKey, input] of inputs) {
        if (input.userId === userId) {
          inputs.delete(mapKey);
          removed += 1;
        }
      }
      return removed;
    },
  };
}
