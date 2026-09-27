import { parseInstant } from "../domain";
import type { Clock, ProposalRepository, StoredSlotProposal } from "../domain";

export type InMemoryProposalRepositoryOptions = {
  readonly clock: Clock;
};

type Entry = { readonly userId: string; readonly proposal: StoredSlotProposal };

/**
 * In-memory `ProposalRepository`, one proposal per `(userId, taskId)`. `get`
 * treats an expired proposal exactly like a missing one (checked against the
 * injected clock).
 */
export function createInMemoryProposalRepository(
  options: InMemoryProposalRepositoryOptions,
): ProposalRepository {
  const { clock } = options;
  const proposals = new Map<string, Entry>();
  const key = (userId: string, taskId: string): string => `${userId}\u0000${taskId}`;

  const owned = (userId: string, taskId: string): Entry | undefined => {
    const entry = proposals.get(key(userId, taskId));
    if (entry === undefined) return undefined;
    return parseInstant(entry.proposal.expiresAt) <= parseInstant(clock.now()) ? undefined : entry;
  };

  return {
    async save(userId, proposal) {
      const stored = structuredClone(proposal);
      proposals.set(key(userId, proposal.taskId), { userId, proposal: stored });
      return structuredClone(stored);
    },

    async get(userId, taskId) {
      const entry = owned(userId, taskId);
      return entry === undefined ? null : structuredClone(entry.proposal);
    },

    async delete(userId, taskId) {
      proposals.delete(key(userId, taskId));
    },

    async deleteAllForUser(userId) {
      let removed = 0;
      for (const [mapKey, entry] of proposals) {
        if (entry.userId === userId) {
          proposals.delete(mapKey);
          removed += 1;
        }
      }
      return removed;
    },

    async purgeExpired(now) {
      const nowMs = parseInstant(now);
      let removed = 0;
      for (const [mapKey, entry] of proposals) {
        if (parseInstant(entry.proposal.expiresAt) <= nowMs) {
          proposals.delete(mapKey);
          removed += 1;
        }
      }
      return removed;
    },
  };
}
