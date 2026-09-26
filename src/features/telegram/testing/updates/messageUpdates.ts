import type { Chat, Message, MessageOrigin, Update, User } from "grammy/types";
import { ALEX, createGroupChat, createSupergroupChat, privateChatOf } from "../participants";
import { baseMessage, withText } from "./context";
import type { BuilderContext, GroupMessageOptions, MessageOptions, NonChannelChat } from "./context";
import { mentionsUsername } from "./entities";

/** Where a forwarded message came from: the four `forward_origin` variants. */
export type ForwardSource =
  | { readonly kind: "user"; readonly user: User; readonly date?: number }
  | { readonly kind: "hidden_user"; readonly name: string; readonly date?: number }
  | {
      readonly kind: "chat";
      readonly chat: Chat.GroupChat | Chat.SupergroupChat;
      readonly signature?: string;
      readonly date?: number;
    }
  | {
      readonly kind: "channel";
      readonly chat: Chat.ChannelChat;
      readonly messageId: number;
      readonly signature?: string;
      readonly date?: number;
    };

export type VoiceOptions = MessageOptions & {
  readonly mimeType?: string;
  readonly fileSize?: number;
  readonly fileUniqueId?: string;
};

export type GroupReplyOptions = GroupMessageOptions & {
  /** A part of the replied text, as chosen with the "quote" gesture. */
  readonly quote?: string;
};

export type GuestMessageOptions = GroupMessageOptions & {
  readonly guestQueryId?: string;
  /** The message the guest bot was called on. */
  readonly replyTo?: Message;
};

const ONE_HOUR = 3600;

type MessageUpdate = Update & { message: NonNullable<Update["message"]> };

function toOrigin(context: BuilderContext, source: ForwardSource): MessageOrigin {
  const date = source.date ?? context.nowSeconds() - ONE_HOUR;
  switch (source.kind) {
    case "user":
      return { type: "user", sender_user: source.user, date };
    case "hidden_user":
      return { type: "hidden_user", sender_user_name: source.name, date };
    case "chat":
      return {
        type: "chat",
        sender_chat: source.chat,
        date,
        ...(source.signature === undefined ? {} : { author_signature: source.signature }),
      };
    case "channel":
      return {
        type: "channel",
        chat: source.chat,
        message_id: source.messageId,
        date,
        ...(source.signature === undefined ? {} : { author_signature: source.signature }),
      };
  }
}

/** Builders for message, edited message, guest message and voice updates. */
export function createMessageUpdates(context: BuilderContext) {
  const inPrivateChat = (options: MessageOptions): { from: User; chat: NonChannelChat } => {
    const from = options.from ?? ALEX;
    return { from, chat: privateChatOf(from) };
  };

  const textMessage = (
    text: string,
    from: User,
    chat: NonChannelChat,
    options: MessageOptions & { readonly threadId?: number },
  ): NonNullable<Update["message"]> => ({
    ...baseMessage(context, chat, from, options),
    ...withText(text, options),
  });

  const asMessage = (message: NonNullable<Update["message"]>): MessageUpdate => ({
    update_id: context.nextUpdateId(),
    message,
  });

  const groupChatOf = (options: GroupMessageOptions): Chat.GroupChat | Chat.SupergroupChat =>
    options.chat ?? createGroupChat();

  const groupText = (text: string, options: GroupMessageOptions = {}): MessageUpdate =>
    asMessage(textMessage(text, options.from ?? ALEX, groupChatOf(options), options));

  return {
    privateText(text: string, options: MessageOptions = {}): MessageUpdate {
      const { from, chat } = inPrivateChat(options);
      return asMessage(textMessage(text, from, chat, options));
    },

    /** `/name` or `/name payload` in a private chat; a `/start` payload is a deep link. */
    command(name: string, payload?: string, options: MessageOptions = {}): MessageUpdate {
      const { from, chat } = inPrivateChat(options);
      const text = payload === undefined ? `/${name}` : `/${name} ${payload}`;
      return asMessage(textMessage(text, from, chat, options));
    },

    /** `/name@bot payload` in a group, the way Telegram sends a command to a privacy-mode bot. */
    groupCommand(name: string, payload: string | undefined, options: GroupMessageOptions = {}): MessageUpdate {
      const command = `/${name}@${context.botUsername}`;
      return groupText(payload === undefined ? command : `${command} ${payload}`, options);
    },

    forwardedText(text: string, source: ForwardSource, options: MessageOptions = {}): MessageUpdate {
      const { from, chat } = inPrivateChat(options);
      return asMessage({ ...textMessage(text, from, chat, options), forward_origin: toOrigin(context, source) });
    },

    groupText,

    /** A group message that mentions the bot; refuses a text without the mention. */
    groupMention(text: string, options: GroupMessageOptions = {}): MessageUpdate {
      const update = groupText(text, options);
      const { message } = update;
      if (!mentionsUsername(message.text ?? "", message.entities ?? [], context.botUsername)) {
        throw new Error(`groupMention: the text does not mention @${context.botUsername}`);
      }
      return update;
    },

    /** A message in a topic of a forum supergroup. */
    topicMessage(
      text: string,
      options: Omit<GroupMessageOptions, "chat" | "threadId"> & {
        readonly threadId: number;
        readonly chat?: Chat.SupergroupChat;
      },
    ): MessageUpdate {
      return groupText(text, { ...options, chat: options.chat ?? createSupergroupChat({ is_forum: true }) });
    },

    /** A reply to `original`, optionally quoting a part of it. */
    groupReply(text: string, original: Message, options: GroupReplyOptions = {}): MessageUpdate {
      const chat = options.chat ?? original.chat;
      if (chat.type !== "group" && chat.type !== "supergroup") {
        throw new Error("groupReply: the replied message must be in a group or supergroup");
      }
      const message = textMessage(text, options.from ?? ALEX, chat, options);
      const quoted = options.quote;
      const position = quoted === undefined ? -1 : (original.text ?? "").indexOf(quoted);
      if (quoted !== undefined && position < 0) {
        throw new Error("groupReply: the quote is not a substring of the replied message");
      }
      return asMessage({
        ...message,
        reply_to_message: { ...original, reply_to_message: undefined },
        ...(quoted === undefined ? {} : { quote: { text: quoted, position, is_manual: true } }),
      });
    },

    voice(fileId: string, durationSeconds: number, options: VoiceOptions = {}): MessageUpdate {
      const { from, chat } = inPrivateChat(options);
      return asMessage({
        ...baseMessage(context, chat, from, options),
        voice: {
          file_id: fileId,
          file_unique_id: options.fileUniqueId ?? `unique-${fileId}`,
          duration: durationSeconds,
          mime_type: options.mimeType ?? "audio/ogg",
          ...(options.fileSize === undefined ? {} : { file_size: options.fileSize }),
        },
      });
    },

    /** The user edited a message of theirs (`edited_message`). */
    editedMessage(
      text: string,
      options: MessageOptions & { readonly messageId: number; readonly editDate?: number },
    ): Update & { edited_message: NonNullable<Update["edited_message"]> } {
      const { from, chat } = inPrivateChat(options);
      const message = textMessage(text, from, chat, options);
      return {
        update_id: context.nextUpdateId(),
        edited_message: { ...message, edit_date: options.editDate ?? context.nowSeconds() },
      };
    },

    /** The bot was called with an @mention in a chat it is not a member of. */
    guestMessage(
      text: string,
      options: GuestMessageOptions = {},
    ): Update & { guest_message: NonNullable<Update["guest_message"]> } {
      const message = textMessage(text, options.from ?? ALEX, groupChatOf(options), options);
      return {
        update_id: context.nextUpdateId(),
        guest_message: {
          ...message,
          guest_query_id: options.guestQueryId ?? context.nextQueryId("guest"),
          ...(options.replyTo === undefined
            ? {}
            : { reply_to_message: { ...options.replyTo, reply_to_message: undefined } }),
        },
      };
    },

    /** Data sent back by a Web App opened from a keyboard button. */
    webAppData(data: string, buttonText: string, options: MessageOptions = {}): MessageUpdate {
      const { from, chat } = inPrivateChat(options);
      return asMessage({
        ...baseMessage(context, chat, from, options),
        web_app_data: { data, button_text: buttonText },
      });
    },
  };
}
