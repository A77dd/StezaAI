import type { Chat } from "grammy/types";
import { forbidden } from "../validation/rejection";
import type { ApiRejection } from "../validation/rejection";

export type AccessLoss =
  | "blocked"
  | "kicked"
  | "left"
  /** The chat is only known from a guest message: the bot was never added to it. */
  | "guest";

/**
 * Chats the bot cannot write to: set by `my_chat_member` updates (blocked by
 * the user in a private chat, kicked or left in a group) and by guest messages
 * (the bot was called in a chat it is not a member of, so it may only answer
 * with `answerGuestQuery`). Sends to such a chat are answered with the 403 the
 * real API gives.
 * UNVERIFIED: the 403 applies to sends, drafts and chat actions; edits,
 * deletes and reactions in such a chat are not refused.
 */
export function createChatAccess() {
  const lost = new Map<number, AccessLoss>();
  return {
    lose(chatId: number, reason: AccessLoss): void {
      lost.set(chatId, reason);
    },
    restore(chatId: number): void {
      lost.delete(chatId);
    },
    /** Regular activity in a chat known only from a guest message means the bot has since been added. */
    restoreIfGuest(chatId: number): void {
      if (lost.get(chatId) === "guest") lost.delete(chatId);
    },
    isBlocked(chatId: number): boolean {
      return lost.has(chatId);
    },
    /** The rejection for writing to `chat`, or `undefined` while the bot has access. */
    rejection(chat: Chat): ApiRejection | undefined {
      const reason = lost.get(chat.id);
      if (reason === undefined) return undefined;
      if (chat.type === "private") {
        // UNVERIFIED: the text for a private chat the bot only knows from a guest message.
        return reason === "guest"
          ? forbidden("bot can't initiate conversation with a user")
          : forbidden("bot was blocked by the user");
      }
      const kind = chat.type === "supergroup" ? "supergroup" : "group";
      return reason === "left" || reason === "guest"
        ? forbidden(`bot is not a member of the ${kind} chat`)
        : forbidden(`bot was kicked from the ${kind} chat`);
    },
    clear(): void {
      lost.clear();
    },
  };
}

export type ChatAccess = ReturnType<typeof createChatAccess>;
