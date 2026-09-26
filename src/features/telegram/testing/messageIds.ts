/**
 * Message identifiers are one sequence per chat, shared by messages the bot
 * sends and messages users send (so an incoming message and a reply never
 * collide). The fake Bot API and the update builders draw from one allocator
 * when they belong to the same test kit.
 */
export type MessageIdAllocator = {
  /** The next unused message id of the chat, starting at 1. */
  next(chatId: number): number;
};

export function createMessageIdAllocator(): MessageIdAllocator {
  const last = new Map<number, number>();
  return {
    next(chatId) {
      const id = (last.get(chatId) ?? 0) + 1;
      last.set(chatId, id);
      return id;
    },
  };
}
