import { parseInstant } from "../domain";
import type { Clock, Draft, DraftRepository } from "../domain";

export type InMemoryDraftRepositoryOptions = {
  readonly clock: Clock;
};

/**
 * In-memory `DraftRepository`. `get` treats an expired draft exactly like a
 * missing one (checked against the injected clock), so a stale button can
 * never resolve to a draft that has silently outlived its purpose.
 */
export function createInMemoryDraftRepository(options: InMemoryDraftRepositoryOptions): DraftRepository {
  const { clock } = options;
  const drafts = new Map<string, Draft>();

  const owned = (userId: string, id: string): Draft | undefined => {
    const draft = drafts.get(id);
    if (draft === undefined || draft.userId !== userId) return undefined;
    return parseInstant(draft.expiresAt) <= parseInstant(clock.now()) ? undefined : draft;
  };

  return {
    async save(draft) {
      const stored = structuredClone(draft);
      drafts.set(stored.id, stored);
      return structuredClone(stored);
    },

    async get(userId, id) {
      const draft = owned(userId, id);
      return draft === undefined ? null : structuredClone(draft);
    },

    async delete(userId, id) {
      const draft = drafts.get(id);
      if (draft !== undefined && draft.userId === userId) drafts.delete(id);
    },

    async deleteAllForUser(userId) {
      let removed = 0;
      for (const [id, draft] of drafts) {
        if (draft.userId === userId) {
          drafts.delete(id);
          removed += 1;
        }
      }
      return removed;
    },

    async purgeExpired(now) {
      const nowMs = parseInstant(now);
      let removed = 0;
      for (const [id, draft] of drafts) {
        if (parseInstant(draft.expiresAt) <= nowMs) {
          drafts.delete(id);
          removed += 1;
        }
      }
      return removed;
    },
  };
}
