import type { ResponseParameters, UserFromGetMe } from "grammy/types";
import type { Clock, Instant } from "../domain";
import type { MessageIdAllocator } from "./messageIds";
import type { RateLimitOptions } from "./state/rateLimiter";

export type CallOutcome =
  | { readonly kind: "ok"; readonly result: unknown }
  | {
      readonly kind: "error";
      readonly error_code: number;
      readonly description: string;
      readonly parameters?: ResponseParameters;
    }
  | {
      readonly kind: "network_error";
      readonly message: string;
      /** The request took effect before the connection was lost. */
      readonly delivered: boolean;
    };

/** One call the fake Bot API received, with what it answered. */
export type RecordedCall = {
  /** 1-based, in the order calls arrived. */
  readonly seq: number;
  readonly method: string;
  /** The payload as it would go over the wire: JSON data, `undefined` fields dropped. */
  readonly payload: Readonly<Record<string, unknown>>;
  readonly at: Instant;
  readonly outcome: CallOutcome;
};

export type FakeBotApiOptions = {
  /** Time source for message dates, draft and ephemeral windows, flood control. Default: a fixed test clock. */
  readonly clock?: Clock;
  /** Answer of `getMe`. Default: `fakeBotInfo("steza_test_bot")`. */
  readonly botInfo?: UserFromGetMe;
  /** Flood control (429 with `retry_after`): `true` for the documented limits. Default: off. */
  readonly rateLimits?: boolean | Partial<RateLimitOptions>;
  /** Share with an update builder so both draw message ids from one sequence per chat. */
  readonly messageIds?: MessageIdAllocator;
  /** If true, `sendRichMessage` calls fail (useful for tests that expect the HTML fallback). Default: false. */
  readonly failRichMessages?: boolean;
};
