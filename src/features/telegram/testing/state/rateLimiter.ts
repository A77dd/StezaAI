import type { ChatKind } from "../validation/chat";

/**
 * Flood control (research 7.2): "no more than ~1 message per second in one
 * chat", "no more than 20 messages per minute in a group" and "no more than
 * ~30 messages per second" across all chats (broadcasts).
 */
export type RateLimitOptions = {
  /** Minimum spacing between two messages to one chat. */
  readonly perChatIntervalMs: number;
  /** Messages a group chat takes per rolling minute. */
  readonly groupPerMinute: number;
  /** Messages the bot may send per rolling second to all chats together. */
  readonly globalPerSecond: number;
};

export const DEFAULT_RATE_LIMITS: RateLimitOptions = {
  perChatIntervalMs: 1000,
  groupPerMinute: 20,
  globalPerSecond: 30,
};

const SECOND_MS = 1000;
const MINUTE_MS = 60_000;

/**
 * Records message sends and reports when one would be answered with 429.
 * UNVERIFIED: the real limits are approximate ("short bursts are allowed");
 * the fake applies them strictly so a bot that relies on bursts fails in tests.
 * UNVERIFIED: the global limit is "~30 messages per second" in the FAQ, no exact figure.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const lastSend = new Map<string, number>();
  const groupSends = new Map<string, number[]>();
  let allSends: number[] = [];

  return {
    /**
     * Admits a message send at `nowMs` and records it, or returns the
     * `retry_after` seconds of the 429 that rejects it (nothing is recorded).
     */
    admit(chatKey: string, kind: ChatKind, nowMs: number): number | null {
      let waitMs = 0;
      const previous = lastSend.get(chatKey);
      if (previous !== undefined) {
        waitMs = Math.max(waitMs, previous + options.perChatIntervalMs - nowMs);
      }
      const recent = (groupSends.get(chatKey) ?? []).filter((at) => nowMs - at < MINUTE_MS);
      if (kind !== "private" && recent.length >= options.groupPerMinute) {
        const oldest = recent[recent.length - options.groupPerMinute] ?? nowMs;
        waitMs = Math.max(waitMs, oldest + MINUTE_MS - nowMs);
      }
      const lastSecond = allSends.filter((at) => nowMs - at < SECOND_MS);
      if (lastSecond.length >= options.globalPerSecond) {
        const oldest = lastSecond[lastSecond.length - options.globalPerSecond] ?? nowMs;
        waitMs = Math.max(waitMs, oldest + SECOND_MS - nowMs);
      }
      if (waitMs > 0) return Math.max(1, Math.ceil(waitMs / 1000));

      lastSend.set(chatKey, nowMs);
      groupSends.set(chatKey, [...recent, nowMs]);
      allSends = [...lastSecond, nowMs];
      return null;
    },
    clear(): void {
      lastSend.clear();
      groupSends.clear();
      allSends = [];
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
