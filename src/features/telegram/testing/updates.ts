import { createFixedClock } from "../adapters/fixedClock";
import type { Clock } from "../domain";
import { createMessageIdAllocator } from "./messageIds";
import type { MessageIdAllocator } from "./messageIds";
import { DEFAULT_BOT_ID } from "./participants";
import { DEFAULT_TEST_START } from "./testClock";
import { createBuilderContext } from "./updates/context";
import { createInteractionUpdates } from "./updates/interactionUpdates";
import { createMessageUpdates } from "./updates/messageUpdates";

export { fakeBotInfo } from "./participants";
export type { ForwardSource } from "./updates/messageUpdates";
export type { MembershipTransition } from "./updates/interactionUpdates";

export type UpdateBuilderOptions = {
  readonly botUsername: string;
  readonly botId?: number;
  /** Message dates come from it. Default: a fixed clock at the test start instant. */
  readonly clock?: Clock;
  /** Share with the fake Bot API so both draw message ids from one sequence per chat. */
  readonly messageIds?: MessageIdAllocator;
  readonly firstUpdateId?: number;
};

/**
 * Typed builders for structurally valid grammY `Update` objects: incrementing
 * update ids, per-chat message ids, dates from an injected clock, and the
 * `mention` / `bot_command` entities Telegram would add. Every builder returns
 * a plain `Update` with exactly one update field.
 */
export function createUpdateBuilder(options: UpdateBuilderOptions) {
  const context = createBuilderContext({
    botUsername: options.botUsername,
    botId: options.botId ?? DEFAULT_BOT_ID,
    clock: options.clock ?? createFixedClock(DEFAULT_TEST_START),
    messageIds: options.messageIds ?? createMessageIdAllocator(),
    firstUpdateId: options.firstUpdateId ?? 100_000,
  });
  return { ...createMessageUpdates(context), ...createInteractionUpdates(context) };
}

export type UpdateBuilder = ReturnType<typeof createUpdateBuilder>;
