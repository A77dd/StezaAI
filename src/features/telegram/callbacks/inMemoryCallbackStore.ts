import { AlreadyExistsError, InvalidArgumentError, parseInstant } from "../domain";
import type { Clock, Instant } from "../domain";
import { CALLBACK_ACTIONS } from "./actions";
import type { CallbackAction, CallbackPayload } from "./actions";
import { decodeCallbackData, encodeCallbackData } from "./codec";
import {
  CallbackExpiredError,
  CallbackNotFoundError,
  CallbackPayloadCorruptedError,
  CallbackReplayedError,
} from "./errors";
import type { CallbackStore, ResolvedCallback, TokenGenerator } from "./ports";

/** Expired and consumed callbacks stay explainable for this long after expiry. */
export const DEFAULT_CALLBACK_PURGE_GRACE_MS = 24 * 60 * 60 * 1000;

/** One stored callback. Exported so tests can inject and inspect the backing map. */
export type StoredCallback = {
  readonly action: CallbackAction;
  readonly userId: string;
  readonly chatId: number;
  readonly issuedAt: Instant;
  readonly expiresAtMs: number;
  payload: unknown;
  consumed: boolean;
};

export type InMemoryCallbackStoreOptions = {
  readonly clock: Clock;
  readonly tokens: TokenGenerator;
  /** How long after expiry a record is kept so that it answers "expired"/"already used". */
  readonly purgeGraceMs?: number;
  /**
   * Backing map, keyed by token. Defaults to a private map; tests inject one to
   * simulate corrupted rows.
   */
  readonly records?: Map<string, StoredCallback>;
};

/**
 * In-memory `CallbackStore`. Records are keyed by token and returned as
 * `structuredClone` copies. `resolve` never awaits between its checks and the
 * consume step, so single-use consumption is atomic on the event loop.
 * Consumed single-use records are kept (flagged) until `expiresAt + grace`, so
 * a replay answers `CallbackReplayedError` instead of "not found".
 */
export function createInMemoryCallbackStore(options: InMemoryCallbackStoreOptions): CallbackStore {
  const { clock, tokens } = options;
  const graceMs = options.purgeGraceMs ?? DEFAULT_CALLBACK_PURGE_GRACE_MS;
  if (!Number.isInteger(graceMs) || graceMs < 0) {
    throw new InvalidArgumentError("purgeGraceMs must be a non-negative integer");
  }
  const records = options.records ?? new Map<string, StoredCallback>();

  function resolveNow(data: string, ctx: { userId: string; chatId: number }): ResolvedCallback {
    const { action, token } = decodeCallbackData(data);
    const record = records.get(token);
    if (record === undefined) throw new CallbackNotFoundError("unknown_token");
    if (record.action !== action) throw new CallbackNotFoundError("action_mismatch");
    if (record.userId !== ctx.userId) throw new CallbackNotFoundError("owner_mismatch");
    const config = CALLBACK_ACTIONS[record.action];
    if (config.scope === "chat" && record.chatId !== ctx.chatId) {
      throw new CallbackNotFoundError("chat_mismatch");
    }
    if (parseInstant(clock.now()) >= record.expiresAtMs) throw new CallbackExpiredError();
    if (record.consumed) throw new CallbackReplayedError();
    if (!config.validate(record.payload)) {
      throw new CallbackPayloadCorruptedError();
    }
    if (config.singleUse) record.consumed = true;
    return {
      action: record.action,
      payload: structuredClone(record.payload),
      issuedAt: record.issuedAt,
    } as ResolvedCallback;
  }

  return {
    async issue<A extends CallbackAction>(input: {
      action: A;
      userId: string;
      chatId: number;
      payload: CallbackPayload<A>;
    }): Promise<string> {
      const config = CALLBACK_ACTIONS[input.action];
      if (typeof input.userId !== "string" || input.userId === "") {
        throw new InvalidArgumentError("userId must be a non-empty string");
      }
      if (!Number.isSafeInteger(input.chatId)) {
        throw new InvalidArgumentError("chatId must be an integer");
      }
      if (!config.validate(input.payload)) {
        throw new InvalidArgumentError(`Payload is not valid for callback action ${input.action}`);
      }
      const token = tokens.next();
      // Encode first: it enforces charset and the 64-byte limit before anything is stored.
      const data = encodeCallbackData(input.action, token);
      if (records.has(token)) {
        throw new AlreadyExistsError("Callback token collision: the token generator repeated a token");
      }
      const issuedAt = clock.now();
      records.set(token, {
        action: input.action,
        userId: input.userId,
        chatId: input.chatId,
        issuedAt,
        expiresAtMs: parseInstant(issuedAt) + config.ttlMs,
        payload: structuredClone(input.payload),
        consumed: false,
      });
      return data;
    },

    resolve: async (data, ctx) => resolveNow(data, ctx),

    async revokeForUser(userId) {
      let removed = 0;
      for (const [token, record] of records) {
        if (record.userId === userId) {
          records.delete(token);
          removed += 1;
        }
      }
      return removed;
    },

    async purgeExpired(now) {
      const nowMs = parseInstant(now);
      let removed = 0;
      for (const [token, record] of records) {
        if (record.expiresAtMs + graceMs <= nowMs) {
          records.delete(token);
          removed += 1;
        }
      }
      return removed;
    },
  };
}
