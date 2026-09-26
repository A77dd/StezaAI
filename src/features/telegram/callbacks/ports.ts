import type { Instant } from "../domain";
import type { CallbackAction, CallbackPayload } from "./actions";

/**
 * Callback ports. `callback_data` is client-controlled: a modified client can
 * send any string, replay it, or send another user's button data. So payloads
 * live server-side and `callback_data` carries only `v1:<action>:<token>`.
 * Every `resolve` checks ownership, expiry and single-use, and fails with a
 * typed error (`./errors`) that handlers turn into a visible answer.
 */

/** A resolved callback; discriminated by `action` so handlers get a narrowed payload. */
export type ResolvedCallback = {
  readonly [A in CallbackAction]: {
    readonly action: A;
    readonly payload: CallbackPayload<A>;
    readonly issuedAt: Instant;
  };
}[CallbackAction];

export interface CallbackStore {
  /**
   * Stores `payload` for the user and chat and returns the full
   * `callback_data` (at most 64 bytes). Throws `InvalidArgumentError` for a
   * payload that fails the action's validator or a malformed owner.
   */
  issue<A extends CallbackAction>(input: {
    action: A;
    userId: string;
    chatId: number;
    payload: CallbackPayload<A>;
  }): Promise<string>;

  /**
   * Decodes `data`, checks it and returns an independent copy of the payload.
   * Checks run in this order: format (`CallbackMalformedError`,
   * `CallbackVersionError`, `CallbackUnknownActionError`); existence and
   * ownership (`CallbackNotFoundError` for an unknown token, a token of
   * another action, another user, or, for chat-scoped actions, another chat;
   * indistinguishable from each other for the client); expiry
   * (`CallbackExpiredError`); replay of a single-use token
   * (`CallbackReplayedError`); payload shape (`CallbackMalformedError`, the
   * token is not consumed). A single-use token is consumed atomically by the
   * first successful resolve: of concurrent resolves exactly one succeeds.
   */
  resolve(data: string, ctx: { userId: string; chatId: number }): Promise<ResolvedCallback>;

  /** Deletes every callback of the user (used by /deleteme). Returns how many. */
  revokeForUser(userId: string): Promise<number>;

  /**
   * Deletes callbacks that expired long enough ago that explaining them is no
   * longer useful (an adapter-defined grace after expiry, so recently expired
   * or consumed buttons still answer "expired"/"already used"). Returns how many.
   */
  purgeExpired(now: Instant): Promise<number>;
}

/** Source of opaque, unguessable tokens matching `[A-Za-z0-9_-]{8,32}`. */
export interface TokenGenerator {
  next(): string;
}
