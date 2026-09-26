import type { Chat, Message, Update, User } from "grammy/types";
import { ALEX, privateChatOf } from "../participants";
import type { BuilderContext } from "./context";
import { utf8Bytes } from "../validation/guards";

export type InlineQueryOptions = {
  readonly from?: User;
  readonly offset?: string;
  readonly chatType?: "sender" | Chat["type"];
};

export type CallbackOptions = {
  /** Who pressed the button; needed for group messages, inferred from a private chat. */
  readonly from?: User;
};

/**
 * Transitions of the bot's own membership (`my_chat_member`).
 * Private chats: the user blocks or unblocks the bot. Groups: the bot is
 * added, removed by an administrator, or leaves.
 */
export type MembershipTransition = "blocked" | "unblocked" | "added" | "removed" | "left";

const PRIVATE_TRANSITIONS: readonly MembershipTransition[] = ["blocked", "unblocked"];
const CALLBACK_DATA_MAX_BYTES = 64;

type ChatMemberStatus = "member" | "kicked" | "left";

/** The bot's status before and after each transition. */
const TRANSITIONS: Readonly<Record<MembershipTransition, readonly [ChatMemberStatus, ChatMemberStatus]>> = {
  blocked: ["member", "kicked"],
  unblocked: ["kicked", "member"],
  added: ["left", "member"],
  removed: ["member", "kicked"],
  left: ["member", "left"],
};

/** Builders for queries, callback presses, membership changes and generation updates. */
export function createInteractionUpdates(context: BuilderContext) {
  const botMember = (status: ChatMemberStatus) => {
    const user = context.bot;
    if (status === "kicked") return { status, user, until_date: 0 } as const;
    return { status, user } as const;
  };

  const checkedData = (data: string): string => {
    const bytes = utf8Bytes(data);
    if (bytes < 1 || bytes > CALLBACK_DATA_MAX_BYTES) {
      throw new RangeError("callback data must be 1-64 bytes: no real button can carry anything else");
    }
    return data;
  };

  return {
    inlineQuery(query: string, options: InlineQueryOptions = {}): Update & { inline_query: NonNullable<Update["inline_query"]> } {
      return {
        update_id: context.nextUpdateId(),
        inline_query: {
          id: context.nextQueryId("inline"),
          from: options.from ?? ALEX,
          query,
          offset: options.offset ?? "",
          ...(options.chatType === undefined ? {} : { chat_type: options.chatType }),
        },
      };
    },

    /** Needs `/setinlinefeedback`; carries an inline message id only if the result had a keyboard. */
    chosenInlineResult(
      resultId: string,
      query: string,
      options: { readonly from?: User; readonly inlineMessageId?: string } = {},
    ): Update & { chosen_inline_result: NonNullable<Update["chosen_inline_result"]> } {
      return {
        update_id: context.nextUpdateId(),
        chosen_inline_result: {
          result_id: resultId,
          from: options.from ?? ALEX,
          query,
          ...(options.inlineMessageId === undefined ? {} : { inline_message_id: options.inlineMessageId }),
        },
      };
    },

    /** A user pressed a callback button of `message`. */
    callbackQuery(
      message: Message,
      data: string,
      options: CallbackOptions = {},
    ): Update & { callback_query: NonNullable<Update["callback_query"]> } {
      const chat = message.chat;
      let from = options.from;
      if (from === undefined) {
        if (chat.type !== "private") {
          throw new Error("callbackQuery: pass options.from, the presser, for a message in a group");
        }
        from = chat.id === ALEX.id ? ALEX : { id: chat.id, is_bot: false, first_name: chat.first_name };
      }
      return {
        update_id: context.nextUpdateId(),
        callback_query: {
          id: context.nextQueryId("callback"),
          from,
          message,
          chat_instance: `chat-instance-${chat.id}`,
          data: checkedData(data),
        },
      };
    },

    /** A user pressed a callback button of an inline message (sent via the bot in inline mode). */
    inlineMessageCallbackQuery(
      inlineMessageId: string,
      data: string,
      options: CallbackOptions = {},
    ): Update & { callback_query: NonNullable<Update["callback_query"]> } {
      return {
        update_id: context.nextUpdateId(),
        callback_query: {
          id: context.nextQueryId("callback"),
          from: options.from ?? ALEX,
          inline_message_id: inlineMessageId,
          chat_instance: `chat-instance-inline-${inlineMessageId}`,
          data: checkedData(data),
        },
      };
    },

    /** The bot's own membership changed; private chats only report blocks and unblocks. */
    myChatMember(
      transition: MembershipTransition,
      options: { readonly chat?: Chat.PrivateChat | Chat.GroupChat | Chat.SupergroupChat; readonly from?: User } = {},
    ): Update & { my_chat_member: NonNullable<Update["my_chat_member"]> } {
      const from = options.from ?? ALEX;
      const chat = options.chat ?? privateChatOf(from);
      const isPrivate = PRIVATE_TRANSITIONS.includes(transition);
      if (chat.type === "private" && !isPrivate) {
        throw new Error(`myChatMember: "${transition}" does not happen in a private chat (use blocked or unblocked)`);
      }
      if (chat.type !== "private" && isPrivate) {
        throw new Error(`myChatMember: "${transition}" does not happen in a group (use added, removed or left)`);
      }
      const [oldStatus, newStatus] = TRANSITIONS[transition];
      return {
        update_id: context.nextUpdateId(),
        my_chat_member: {
          chat,
          from,
          date: context.nowSeconds(),
          old_chat_member: botMember(oldStatus),
          new_chat_member: botMember(newStatus),
        },
      };
    },

    /** The user pressed the stop button of a message draft. */
    messageGenerationStopped(options: {
      readonly draftId: number;
      readonly user?: User;
      readonly threadId?: number;
    }): Update & { stopped_message_generation: NonNullable<Update["stopped_message_generation"]> } {
      return {
        update_id: context.nextUpdateId(),
        stopped_message_generation: {
          chat: privateChatOf(options.user ?? ALEX),
          draft_id: options.draftId,
          ...(options.threadId === undefined ? {} : { message_thread_id: options.threadId }),
        },
      };
    },
  };
}
