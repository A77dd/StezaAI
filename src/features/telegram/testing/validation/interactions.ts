import type { ReactionTypeEmoji } from "grammy/types";
import { readChatTarget } from "./chat";
import type { ChatTarget } from "./chat";
import {
  optionalBoolean,
  optionalInteger,
  rejectUnmodelled,
  requireInteger,
  requireString,
} from "./guards";
import type { Payload } from "./guards";
import { badRequest } from "./rejection";

type ReactionEmoji = ReactionTypeEmoji["emoji"];

// A Record over the union fails to compile when the Bot API types add or
// remove a reaction, so this list cannot drift from `@grammyjs/types`
// ("Reaction emoji. Currently, it can be one of ..." - 73 emoji).
const REACTION_EMOJI: Readonly<Record<ReactionEmoji, true>> = {
  "👍": true, "👎": true, "❤": true, "🔥": true, "🥰": true, "👏": true, "😁": true,
  "🤔": true, "🤯": true, "😱": true, "🤬": true, "😢": true, "🎉": true, "🤩": true,
  "🤮": true, "💩": true, "🙏": true, "👌": true, "🕊": true, "🤡": true, "🥱": true,
  "🥴": true, "😍": true, "🐳": true, "❤‍🔥": true, "🌚": true, "🌭": true, "💯": true,
  "🤣": true, "⚡": true, "🍌": true, "🏆": true, "💔": true, "🤨": true, "😐": true,
  "🍓": true, "🍾": true, "💋": true, "🖕": true, "😈": true, "😴": true, "😭": true,
  "🤓": true, "👻": true, "👨‍💻": true, "👀": true, "🎃": true, "🙈": true, "😇": true,
  "😨": true, "🤝": true, "✍": true, "🤗": true, "🫡": true, "🎅": true, "🎄": true,
  "☃": true, "💅": true, "🤪": true, "🗿": true, "🆒": true, "💘": true, "🙉": true,
  "🦄": true, "😘": true, "💊": true, "🙊": true, "😎": true, "👾": true, "🤷‍♂": true,
  "🤷": true, "🤷‍♀": true, "😡": true,
};

export const ALLOWED_REACTION_EMOJI: readonly string[] = Object.keys(REACTION_EMOJI);

const CHAT_ACTIONS: readonly string[] = [
  "typing",
  "upload_photo",
  "record_video",
  "upload_video",
  "record_voice",
  "upload_voice",
  "upload_document",
  "choose_sticker",
  "find_location",
  "record_video_note",
  "upload_video_note",
];

export type ChatActionRequest = { readonly chat: ChatTarget; readonly action: string };

/**
 * UNVERIFIED: the description for an unknown action. Business connections are
 * not modelled.
 */
export function readSendChatAction(payload: Payload): ChatActionRequest {
  rejectUnmodelled(payload, ["business_connection_id"]);
  const chat = readChatTarget(payload);
  optionalInteger(payload, "message_thread_id", 1);
  const action = payload.action;
  if (typeof action !== "string" || !CHAT_ACTIONS.includes(action)) {
    throw badRequest("wrong parameter action in request");
  }
  return { chat, action };
}

export type ReactionRequest = {
  readonly chatId: number | string;
  readonly messageId: number;
  /** `null` clears the reaction. */
  readonly emoji: string | null;
};

/**
 * `setMessageReaction`: a bot may set up to one reaction and only from the 73
 * standard emoji (research 5.3); paid reactions are forbidden for bots.
 * UNVERIFIED: custom emoji reactions are rejected (the fake cannot know which
 * ones the chat allows), and the descriptions REACTION_INVALID and
 * REACTIONS_TOO_MANY.
 */
export function readSetMessageReaction(payload: Payload): ReactionRequest {
  const chat = readChatTarget(payload);
  const messageId = requireInteger(payload, "message_id", 1, "message identifier is not specified");
  optionalBoolean(payload, "is_big");
  const reaction = payload.reaction ?? [];
  if (!Array.isArray(reaction)) throw badRequest("reaction must be an array");
  if (reaction.length > 1) throw badRequest("REACTIONS_TOO_MANY");
  const [first] = reaction as unknown[];
  if (first === undefined) return { chatId: chat.id, messageId, emoji: null };
  if (
    typeof first !== "object" ||
    first === null ||
    !("type" in first) ||
    first.type !== "emoji" ||
    !("emoji" in first) ||
    typeof first.emoji !== "string" ||
    !ALLOWED_REACTION_EMOJI.includes(first.emoji)
  ) {
    throw badRequest("REACTION_INVALID");
  }
  return { chatId: chat.id, messageId, emoji: first.emoji };
}

export function readGetFile(payload: Payload): string {
  return requireString(payload, "file_id", "invalid file_id");
}
