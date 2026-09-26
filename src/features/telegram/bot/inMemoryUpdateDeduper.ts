import { InvalidArgumentError, parseInstant } from "../domain";
import type { Clock } from "../domain";
import type { UpdateDeduper } from "./ports";

/** Telegram keeps undelivered updates for 24 hours; a week also covers its id-reset rule. */
export const DEFAULT_UPDATE_ID_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_MAX_TRACKED_UPDATES = 10_000;

export type InMemoryUpdateDeduperOptions = {
  readonly clock: Clock;
  readonly ttlMs?: number;
  readonly maxEntries?: number;
};

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new InvalidArgumentError(`${name} must be a positive integer`);
  }
}

/**
 * Bounded in-memory `UpdateDeduper`: at most `maxEntries` ids (10 000), each
 * for at most `ttlMs` (7 days). A `Map` keeps insertion order, so the oldest id
 * is always first: expired ids are dropped from the front, and when the map is
 * still full the oldest live id is evicted. Evicting a live id can let a very
 * old duplicate through; with 10 000 slots that needs 10 000 newer updates
 * between a delivery and its redelivery, far beyond Telegram's retry window.
 *
 * State lives in one process: several instances (serverless) each dedupe only
 * what they saw. The durable answer is the inbox table keyed by `update_id`
 * (research 4.2).
 */
export function createInMemoryUpdateDeduper(options: InMemoryUpdateDeduperOptions): UpdateDeduper {
  const ttlMs = options.ttlMs ?? DEFAULT_UPDATE_ID_TTL_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_TRACKED_UPDATES;
  assertPositiveInteger("ttlMs", ttlMs);
  assertPositiveInteger("maxEntries", maxEntries);
  const expiresAt = new Map<number, number>();

  const nowMs = (): number => parseInstant(options.clock.now());

  function dropExpired(now: number): void {
    for (const [id, expiry] of expiresAt) {
      if (expiry > now) break;
      expiresAt.delete(id);
    }
  }

  return {
    async claim(updateId) {
      const now = nowMs();
      dropExpired(now);
      const known = expiresAt.get(updateId);
      if (known !== undefined && known > now) return "duplicate";
      expiresAt.delete(updateId);
      while (expiresAt.size >= maxEntries) {
        const oldest = expiresAt.keys().next();
        if (oldest.done === true) break;
        expiresAt.delete(oldest.value);
      }
      expiresAt.set(updateId, now + ttlMs);
      return "claimed";
    },
    async release(updateId) {
      expiresAt.delete(updateId);
    },
  };
}
