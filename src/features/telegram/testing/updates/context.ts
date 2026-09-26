import type { Chat, Message, MessageEntity, User } from "grammy/types";
import type { Clock } from "../../domain";
import { parseInstant } from "../../domain";
import type { MessageIdAllocator } from "../messageIds";
import { detectEntities } from "./entities";

export type NonChannelChat = Chat.PrivateChat | Chat.GroupChat | Chat.SupergroupChat;

/** State shared by the builders of one `createUpdateBuilder` call. */
export type BuilderContext = {
  readonly botUsername: string;
  readonly bot: User;
  readonly messageIds: MessageIdAllocator;
  nextUpdateId(): number;
  nextQueryId(prefix: string): string;
  /** Unix time in seconds. */
  nowSeconds(): number;
};

export function createBuilderContext(options: {
  readonly botUsername: string;
  readonly botId: number;
  readonly clock: Clock;
  readonly messageIds: MessageIdAllocator;
  readonly firstUpdateId: number;
}): BuilderContext {
  let updateId = options.firstUpdateId - 1;
  const queryCounters = new Map<string, number>();
  return {
    botUsername: options.botUsername,
    bot: { id: options.botId, is_bot: true, first_name: "Fake bot", username: options.botUsername },
    messageIds: options.messageIds,
    nextUpdateId: () => {
      updateId += 1;
      return updateId;
    },
    nextQueryId: (prefix) => {
      const next = (queryCounters.get(prefix) ?? 0) + 1;
      queryCounters.set(prefix, next);
      return `${prefix}-${next}`;
    },
    nowSeconds: () => Math.floor(parseInstant(options.clock.now()) / 1000),
  };
}

/** Options every message-like builder takes. */
export type MessageOptions = {
  readonly from?: User;
  /** Unix time in seconds; default: the builder's clock. */
  readonly date?: number;
  /** Default: the next id of the chat's shared sequence. */
  readonly messageId?: number;
  /** Overrides the sender's `language_code`. */
  readonly languageCode?: string;
  /** Replaces the mention and command entities Telegram would detect. */
  readonly entities?: readonly MessageEntity[];
};

export type GroupMessageOptions = MessageOptions & {
  readonly chat?: Chat.GroupChat | Chat.SupergroupChat;
  readonly threadId?: number;
};

export function senderOf(from: User, languageCode: string | undefined): User {
  return languageCode === undefined ? from : { ...from, language_code: languageCode };
}

/** The fields every message has; `text` and friends are added by the builder. */
export function baseMessage(
  context: BuilderContext,
  chat: NonChannelChat,
  from: User,
  options: MessageOptions & { readonly threadId?: number },
): Message & { from: User; chat: NonChannelChat } {
  return {
    message_id: options.messageId ?? context.messageIds.next(chat.id),
    date: options.date ?? context.nowSeconds(),
    chat,
    from: senderOf(from, options.languageCode),
    ...(options.threadId === undefined ? {} : { message_thread_id: options.threadId, is_topic_message: true }),
  };
}

/** Text with the entities Telegram would detect, or the explicit ones. */
export function withText(text: string, options: MessageOptions): { text: string; entities?: MessageEntity[] } {
  const entities = options.entities === undefined ? detectEntities(text) : [...options.entities];
  return entities.length === 0 ? { text } : { text, entities };
}
