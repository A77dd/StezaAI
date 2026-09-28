import type { Message } from "grammy/types";
import type { Instant, SourceRef } from "../domain";

export type ExtractedForward = {
  readonly text: string;
  readonly source: SourceRef;
  readonly dateTimeHints: readonly Instant[];
};

export function extractForwardedMessage(message: Message): ExtractedForward | null {
  const origin = message.forward_origin;
  if (origin === undefined) return null;
  const text = message.text ?? message.caption ?? "";

  let originChatId: number | null;
  let sourceAuthor: string | null;
  let sourceAuthorUsername: string | null = null;
  switch (origin.type) {
    case "user":
      originChatId = origin.sender_user.id;
      sourceAuthor = [origin.sender_user.first_name, origin.sender_user.last_name].filter(Boolean).join(" ");
      sourceAuthorUsername = origin.sender_user.username ?? null;
      break;
    case "hidden_user":
      originChatId = null;
      sourceAuthor = origin.sender_user_name;
      break;
    case "chat":
      originChatId = origin.sender_chat.id;
      sourceAuthor = origin.author_signature ?? ("title" in origin.sender_chat ? origin.sender_chat.title : origin.sender_chat.first_name) ?? null;
      break;
    case "channel":
      originChatId = origin.chat.id;
      sourceAuthor = origin.author_signature ?? origin.chat.title;
      break;
  }

  const entities = message.text === undefined ? message.caption_entities ?? [] : message.entities ?? [];
  const dateTimeHints = [...entities]
    .filter((entity) => entity.type === "date_time")
    .sort((a, b) => a.offset - b.offset)
    .map((entity) => new Date(entity.unix_time * 1000).toISOString());
  return {
    text,
    dateTimeHints,
    source: {
      sourceType: "forwarded_message",
      sourceChatId: message.chat.id,
      originChatId,
      sourceMessageId: message.message_id,
      relatedMessageIds: [],
      sourceText: text,
      sourceAuthor,
      sourceAuthorUsername,
      sourceTimestamp: new Date(origin.date * 1000).toISOString(),
      hiddenOrigin: origin.type === "hidden_user",
    },
  };
}
