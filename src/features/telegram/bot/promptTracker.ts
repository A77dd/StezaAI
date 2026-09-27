import type { PendingInputPurpose } from "../domain";

/**
 * Which message the bot is waiting on a free-text reply for, and what it is
 * for. `PendingInputRepository` (Task 7a) is keyed by `(userId, chatId,
 * promptMessageId)` and already enforces ownership and expiry, but a plain
 * text reply carries no `promptMessageId` of its own (the user is not
 * required to use Telegram's reply-to gesture): this is the small,
 * handler-owned side-table that remembers which message id to look it up
 * with, so the next plain-text message from that chat can be routed as an
 * answer instead of a new task (see `handlers/personal/pendingInput.ts`).
 *
 * `cardMessageId` is set only when answering the prompt should refresh an
 * existing card (a task card for `task_edit`, the settings card for
 * `working_hours`); `timezone` has no card of its own to refresh.
 *
 * Not a domain port: it carries no business meaning and is never persisted
 * beyond the process, so it lives in `bot/`, not `domain/`.
 */
export type PendingPrompt = {
  readonly promptMessageId: number;
  readonly purpose: PendingInputPurpose;
  readonly cardMessageId?: number;
};

export type PromptTracker = {
  /** Remembers the prompt for `(userId, chatId)`, replacing any previous one. */
  remember(userId: string, chatId: number, prompt: PendingPrompt): void;
  /** Reads the remembered prompt without clearing it; `undefined` if there is none. */
  peek(userId: string, chatId: number): PendingPrompt | undefined;
  /** Clears the remembered prompt for `(userId, chatId)`. */
  consume(userId: string, chatId: number): void;
};

/** In-memory `PromptTracker`, one entry per `(userId, chatId)`. */
export function createPromptTracker(): PromptTracker {
  const prompts = new Map<string, PendingPrompt>();
  const key = (userId: string, chatId: number): string => `${userId}\u0000${chatId}`;

  return {
    remember(userId, chatId, prompt) {
      prompts.set(key(userId, chatId), prompt);
    },
    peek(userId, chatId) {
      return prompts.get(key(userId, chatId));
    },
    consume(userId, chatId) {
      prompts.delete(key(userId, chatId));
    },
  };
}
