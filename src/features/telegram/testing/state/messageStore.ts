import type { Chat, InlineKeyboardMarkup, Message } from "grammy/types";
import { normalizeInlineMarkup } from "../validation/keyboard";
import type { RichContent } from "../validation/messages";

/** A message the fake knows: one the bot sent or one delivered from a user. */
export type MessageRecord = {
  readonly chatId: number;
  readonly messageId: number;
  /** The message as the Bot API shows it now (edits replace it). */
  readonly message: Message;
  readonly sentByBot: boolean;
  readonly deleted: boolean;
  /** Content of a rich message; its blocks are not parsed into `message`. */
  readonly rich: RichContent | undefined;
  /** The bot's reaction: `undefined` if never set, `null` if cleared. */
  readonly reaction: string | null | undefined;
};

type MutableRecord = {
  -readonly [K in keyof MessageRecord]: MessageRecord[K];
};

function keyOf(chatId: number, messageId: number): string {
  return `${chatId}:${messageId}`;
}

/**
 * What "message is not modified" compares: text, entities, link preview,
 * rich content and the keyboard (an empty keyboard equals none).
 */
export function contentFingerprint(message: Message, rich: RichContent | undefined): string {
  const markup: InlineKeyboardMarkup | null =
    message.reply_markup === undefined ? null : normalizeInlineMarkup(message.reply_markup);
  return JSON.stringify({
    text: message.text ?? null,
    entities: message.entities ?? [],
    linkPreview: message.link_preview_options ?? null,
    rich: rich ?? null,
    markup,
  });
}

export function createMessageStore() {
  const records = new Map<string, MutableRecord>();
  const chats = new Map<number, Chat>();

  return {
    rememberChat(chat: Chat): void {
      chats.set(chat.id, chat);
    },
    chat(chatId: number): Chat | undefined {
      return chats.get(chatId);
    },
    /** Stores a message; a message with the same chat and id is replaced. */
    add(message: Message, sentByBot: boolean, rich?: RichContent): MessageRecord {
      const record: MutableRecord = {
        chatId: message.chat.id,
        messageId: message.message_id,
        message,
        sentByBot,
        deleted: false,
        rich,
        reaction: undefined,
      };
      records.set(keyOf(record.chatId, record.messageId), record);
      return record;
    },
    /** Whether the message was ever stored, deleted or not. */
    has(chatId: number, messageId: number): boolean {
      return records.has(keyOf(chatId, messageId));
    },
    /** The live (not deleted) message, or `undefined`. */
    get(chatId: number, messageId: number): MessageRecord | undefined {
      const record = records.get(keyOf(chatId, messageId));
      return record === undefined || record.deleted ? undefined : record;
    },
    list(chatId?: number): readonly MessageRecord[] {
      return [...records.values()].filter(
        (record) => !record.deleted && (chatId === undefined || record.chatId === chatId),
      );
    },
    deleted(chatId?: number): readonly MessageRecord[] {
      return [...records.values()].filter(
        (record) => record.deleted && (chatId === undefined || record.chatId === chatId),
      );
    },
    replace(chatId: number, messageId: number, message: Message, rich: RichContent | undefined): void {
      const record = records.get(keyOf(chatId, messageId));
      if (record === undefined) return;
      record.message = message;
      record.rich = rich;
    },
    markDeleted(chatId: number, messageId: number): void {
      const record = records.get(keyOf(chatId, messageId));
      if (record !== undefined) record.deleted = true;
    },
    setReaction(chatId: number, messageId: number, emoji: string | null): void {
      const record = records.get(keyOf(chatId, messageId));
      if (record !== undefined) record.reaction = emoji;
    },
    clear(): void {
      records.clear();
      chats.clear();
    },
  };
}

export type MessageStore = ReturnType<typeof createMessageStore>;
