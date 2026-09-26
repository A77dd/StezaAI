import type { Message, Update } from "grammy/types";
import type { FakeState } from "./fakeState";
import type { FileEntry } from "./fileRegistry";

type Attachment = {
  readonly file_id: string;
  readonly file_unique_id: string;
  readonly file_size?: number;
  readonly mime_type?: string;
  readonly file_name?: string;
  readonly directory: string;
};

function attachmentsOf(message: Message): readonly Attachment[] {
  const found: Attachment[] = [];
  if (message.voice !== undefined) found.push({ ...message.voice, directory: "voice" });
  if (message.audio !== undefined) found.push({ ...message.audio, directory: "music" });
  if (message.document !== undefined) found.push({ ...message.document, directory: "documents" });
  if (message.video_note !== undefined) found.push({ ...message.video_note, directory: "video_notes" });
  for (const size of message.photo ?? []) found.push({ ...size, directory: "photos" });
  return found;
}

function registerFiles(state: FakeState, message: Message): void {
  for (const attachment of attachmentsOf(message)) {
    const entry: FileEntry = {
      file_id: attachment.file_id,
      file_unique_id: attachment.file_unique_id,
      file_path: `${attachment.directory}/${attachment.file_name ?? attachment.file_id}`,
      ...(attachment.file_size === undefined ? {} : { file_size: attachment.file_size }),
      ...(attachment.mime_type === undefined ? {} : { mime_type: attachment.mime_type }),
      ...(attachment.file_name === undefined ? {} : { file_name: attachment.file_name }),
    };
    state.files.register(entry);
  }
}

function observeMessage(state: FakeState, message: Message, edited: boolean): void {
  state.messages.rememberChat(message.chat);
  state.access.restoreIfGuest(message.chat.id);
  const sentByBot = message.from?.id === state.botUser.id;
  if (edited && state.messages.get(message.chat.id, message.message_id) !== undefined) {
    state.messages.replace(message.chat.id, message.message_id, message, undefined);
  } else if (message.message_id !== 0 && !state.messages.has(message.chat.id, message.message_id)) {
    // A repeated update must not undo a deletion or a reaction.
    state.messages.add(message, sentByBot);
  }
  registerFiles(state, message);
  if (message.ephemeral_message_id !== undefined && message.receiver_user !== undefined) {
    state.ephemeral.add({
      chatId: message.chat.id,
      receiverUserId: message.receiver_user.id,
      ephemeralMessageId: message.ephemeral_message_id,
      message,
      createdAtMs: state.nowMs(),
    });
  }
}

/**
 * Registers what an update implies, the way Telegram's own state would have
 * it before the bot sees the update: the message becomes editable or
 * repliable, a callback / inline / guest query becomes answerable once, a
 * blocked or removed bot loses write access, a stopped generation ends its
 * draft, attachments become downloadable with `getFile`.
 */
export function observeUpdate(state: FakeState, update: Update): void {
  if (update.message !== undefined) observeMessage(state, update.message, false);
  if (update.edited_message !== undefined) observeMessage(state, update.edited_message, true);
  if (update.guest_message !== undefined) {
    const guestChat = update.guest_message.chat;
    // A chat never seen before is one the bot was not added to.
    if (state.messages.chat(guestChat.id) === undefined) state.access.lose(guestChat.id, "guest");
    state.messages.rememberChat(guestChat);
    state.messages.add(update.guest_message, false);
    const guestQueryId = update.guest_message.guest_query_id;
    if (guestQueryId !== undefined) {
      state.queries.register({
        kind: "guest",
        id: guestQueryId,
        chatId: update.guest_message.chat.id,
        fromUserId: update.guest_message.from.id,
        deliveredAtMs: state.nowMs(),
      });
    }
  }

  const callback = update.callback_query;
  if (callback !== undefined) {
    const message = callback.message;
    if (message !== undefined && message.date !== 0 && state.messages.get(message.chat.id, message.message_id) === undefined) {
      // A hand built update may press a button of a message the fake never saw.
      observeMessage(state, message, false);
    }
    state.queries.register({
      kind: "callback",
      id: callback.id,
      chatId: message?.chat.id,
      fromUserId: callback.from.id,
      deliveredAtMs: state.nowMs(),
    });
    if (callback.inline_message_id !== undefined) state.queries.rememberInlineMessage(callback.inline_message_id);
  }

  if (update.inline_query !== undefined) {
    state.queries.register({
      kind: "inline",
      id: update.inline_query.id,
      chatId: undefined,
      fromUserId: update.inline_query.from.id,
      deliveredAtMs: state.nowMs(),
    });
  }
  const chosen = update.chosen_inline_result?.inline_message_id;
  if (chosen !== undefined) state.queries.rememberInlineMessage(chosen);

  if (update.my_chat_member !== undefined) {
    const { chat, new_chat_member: member } = update.my_chat_member;
    state.messages.rememberChat(chat);
    if (member.status === "kicked") state.access.lose(chat.id, chat.type === "private" ? "blocked" : "kicked");
    else if (member.status === "left") state.access.lose(chat.id, "left");
    else state.access.restore(chat.id);
  }
  if (update.stopped_message_generation !== undefined) {
    const { chat, draft_id: draftId } = update.stopped_message_generation;
    state.drafts.stop(chat.id, draftId);
  }
}
