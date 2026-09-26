import type { MessageEntity } from "grammy/types";

// Telegram detects these in every message: `@username` mentions and bot
// commands (`/cmd` or `/cmd@bot` at the start of the text or after a space).
const MENTION = /(?<![A-Za-z0-9_])@[A-Za-z][A-Za-z0-9_]{4,31}/g;
const COMMAND = /(?<!\S)\/[A-Za-z0-9_]{1,32}(?:@[A-Za-z][A-Za-z0-9_]{4,31})?/g;

/**
 * The `mention` and `bot_command` entities Telegram adds to a text.
 * Offsets and lengths are UTF-16 code units, which is what JavaScript string
 * indexes are, so an emoji before a mention shifts the offset by two.
 */
export function detectEntities(text: string): MessageEntity[] {
  const commands: MessageEntity[] = [...text.matchAll(COMMAND)].map((match) => ({
    type: "bot_command",
    offset: match.index,
    length: match[0].length,
  }));
  const mentions: MessageEntity[] = [...text.matchAll(MENTION)]
    .filter((match) => !commands.some((command) => match.index >= command.offset && match.index < command.offset + command.length))
    .map((match) => ({ type: "mention", offset: match.index, length: match[0].length }));
  return [...commands, ...mentions].sort((a, b) => a.offset - b.offset);
}

/** Whether `text` mentions `@username` (case-insensitive), the way a group mention is detected. */
export function mentionsUsername(text: string, entities: readonly MessageEntity[], username: string): boolean {
  return entities.some(
    (entity) =>
      entity.type === "mention" &&
      text.slice(entity.offset, entity.offset + entity.length).toLowerCase() === `@${username.toLowerCase()}`,
  );
}
