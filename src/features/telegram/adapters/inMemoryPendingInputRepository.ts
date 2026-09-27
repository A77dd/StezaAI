import { parseInstant } from "../domain";
import type { Clock, PendingInput, PendingInputRepository } from "../domain";

export type InMemoryPendingInputRepositoryOptions = {
  readonly clock: Clock;
};

/**
 * In-memory `PendingInputRepository`, one pending input per prompt message.
 * `save` is an upsert on `(userId, chatId, promptMessageId)`.
 * `consumeByPrompt` never awaits between reading and removing, so it is safe
 * to call concurrently: the entry is consumed by exactly one caller.
 */
export function createInMemoryPendingInputRepository(
  options: InMemoryPendingInputRepositoryOptions,
): PendingInputRepository {
  const { clock } = options;
  const inputs = new Map<string, PendingInput>();
  const key = (userId: string, chatId: number, promptMessageId: number): string =>
    `${userId}\u0000${chatId}\u0000${promptMessageId}`;

  const read = (userId: string, chatId: number, promptMessageId: number, consume: boolean): PendingInput | null => {
    const mapKey = key(userId, chatId, promptMessageId);
    const input = inputs.get(mapKey);
    if (input === undefined || input.userId !== userId) return null;
    if (parseInstant(input.expiresAt) <= parseInstant(clock.now())) {
      inputs.delete(mapKey);
      return null;
    }
    if (consume) inputs.delete(mapKey);
    return structuredClone(input);
  };

  return {
    async save(input) {
      const stored = structuredClone(input);
      inputs.set(key(stored.userId, stored.chatId, stored.promptMessageId), stored);
      return structuredClone(stored);
    },

    async peekByPrompt(userId, chatId, promptMessageId) {
      return read(userId, chatId, promptMessageId, false);
    },

    async consumeByPrompt(userId, chatId, promptMessageId) {
      return read(userId, chatId, promptMessageId, true);
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
