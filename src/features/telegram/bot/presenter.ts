import { InputFile } from "grammy";
import type { Message } from "grammy/types";
import type { KeyboardSpec, RenderedMessage, RenderedTextMessage } from "../render";
import { bindKeyboard, bindRichActions } from "./bindKeyboard";
import type { CallbackOwner } from "./bindKeyboard";
import type { BotContext } from "./context";
import { PresenterError } from "./errors";
import { classifyTelegramError } from "./telegramErrors";

/**
 * The presenter is the bridge between pure `render/` output (plain data) and
 * Telegram: it issues callback tokens, picks the Bot API method and maps
 * fields. Handlers call it with a rendered message and never build
 * `reply_markup` or Bot API payloads themselves.
 */

/** A message the bot can edit: one in a chat, or an inline message (sent through inline mode). */
export type MessageTarget =
  | { readonly kind: "chat"; readonly chatId: number; readonly messageId: number }
  | { readonly kind: "inline"; readonly inlineMessageId: string };

/** `edited`, or `unchanged` when Telegram said the message already looks like this. */
export type EditOutcome = "edited" | "unchanged";

/** Telegram accepts at most 200 characters in a callback answer. */
export const CALLBACK_ANSWER_LIMIT = 200;

function requireUserId(ctx: BotContext, action: string): string {
  if (ctx.from === undefined) {
    throw new PresenterError(`${action}: the update has no user, so buttons cannot be scoped to one`);
  }
  return String(ctx.from.id);
}

/**
 * Who owns the buttons of a card, and the value handlers must pass to
 * `CallbackStore.resolve`: the user is `String(ctx.from.id)`, the chat is the
 * update's chat. Inline messages have no chat, so the user's own id stands in
 * (equal to their private chat id): issue and resolve compute the same value
 * for the same user, which is all the store compares.
 */
export function ownerOf(ctx: BotContext, chatId: number | undefined = ctx.chat?.id): CallbackOwner {
  const userId = requireUserId(ctx, "ownerOf");
  return { userId, chatId: chatId ?? Number(userId) };
}

/** The message a callback button belongs to (in a chat, or an inline message). */
export function targetOfCallback(ctx: BotContext): MessageTarget {
  const query = ctx.callbackQuery;
  if (query === undefined) {
    throw new PresenterError("targetOfCallback: the update is not a callback query");
  }
  if (query.message !== undefined) {
    return { kind: "chat", chatId: query.message.chat.id, messageId: query.message.message_id };
  }
  if (query.inline_message_id !== undefined) {
    return { kind: "inline", inlineMessageId: query.inline_message_id };
  }
  throw new PresenterError("targetOfCallback: the callback query has no message");
}

function linkPreviewOptions(mode: RenderedTextMessage["linkPreview"]): { is_disabled: true } {
  switch (mode) {
    case "disabled":
      return { is_disabled: true };
  }
}

/**
 * The forum topic of the update's message, only when it really is a topic
 * message: in an ordinary supergroup replies also carry a thread id, and
 * sending with it fails ("message thread not found").
 */
function topicOf(ctx: BotContext): { message_thread_id?: number } {
  const message = ctx.msg;
  if (message?.is_topic_message === true && message.message_thread_id !== undefined) {
    return { message_thread_id: message.message_thread_id };
  }
  return {};
}

export type SendCardOptions = {
  /**
   * Reply to the message that invoked the bot. Use it in groups so the answer
   * stays attached to the request. If that message was deleted meanwhile the
   * card is still sent (`allow_sending_without_reply`).
   */
  readonly replyToInvoking?: boolean;
  /** Deliver without a notification sound (`disable_notification`). */
  readonly silent?: boolean;
  /** Send to another chat than the update's (the update's topic and reply are then not used). */
  readonly chatId?: number;
};

/**
 * Sends a rendered message. Text messages go out as HTML with link previews
 * off; rich messages use `sendRichMessage`. A topic message is answered in
 * its topic. Callback tokens for the keyboard are issued first (see
 * `bindKeyboard` for what happens to them if the send fails).
 */
export async function sendCard(
  ctx: BotContext,
  rendered: RenderedMessage,
  options: SendCardOptions = {},
): Promise<Message> {
  const chatId = options.chatId ?? ctx.chat?.id;
  if (chatId === undefined) {
    throw new PresenterError("sendCard: the update has no chat and no chatId option was given");
  }
  const inUpdateChat = chatId === ctx.chat?.id;
  const replyTo = options.replyToInvoking === true && inUpdateChat ? ctx.msg?.message_id : undefined;
  const other = {
    ...(inUpdateChat ? topicOf(ctx) : {}),
    ...(replyTo === undefined
      ? {}
      : { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } }),
    ...(options.silent === true ? { disable_notification: true } : {}),
  };
  if (rendered.kind === "rich_html") {
    // Buttons live inside the document: bind their callback data and
    // substitute the placeholders. No reply_markup is involved.
    const data = await bindRichActions(rendered.actions, ownerOf(ctx, chatId), ctx.services.callbacks);
    const html = rendered.html.replace(/\{\{cb:(\d+)\}\}/g, (_whole, index: string) => {
      const bound = data[Number(index)];
      if (bound === undefined) throw new PresenterError(`sendCard: rich html has no action for placeholder ${index}`);
      return bound;
    });
    return ctx.api.sendRichMessage(chatId, { html }, other);
  }
  const markup = await bindKeyboard(
    rendered.keyboard,
    ownerOf(ctx, chatId),
    ctx.services.callbacks,
  );
  const otherWithMarkup = {
    ...other,
    ...(markup === undefined ? {} : { reply_markup: markup }),
  };
  if (rendered.kind === "rich") {
    return ctx.api.sendRichMessage(chatId, { markdown: rendered.markdown }, otherWithMarkup);
  }
  return ctx.api.sendMessage(chatId, rendered.text, {
    ...otherWithMarkup,
    parse_mode: rendered.parseMode,
    link_preview_options: linkPreviewOptions(rendered.linkPreview),
  });
}

/**
 * Sends `bytes` as a document (for example `/export`'s JSON dump). Not a
 * `RenderedMessage`: a file has no view model, so this bypasses `renderMessage`
 * entirely and goes straight to the Bot API.
 */
export async function sendDocument(ctx: BotContext, fileName: string, bytes: Uint8Array): Promise<Message> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) {
    throw new PresenterError("sendDocument: the update has no chat");
  }
  return ctx.api.sendDocument(chatId, new InputFile(bytes, fileName));
}

/** Runs an edit call; "message is not modified" is an outcome, every other failure propagates. */
async function outcomeOf(edit: () => Promise<unknown>): Promise<EditOutcome> {
  try {
    await edit();
    return "edited";
  } catch (error) {
    // Editing to identical content is harmless (a double tap, a retried edit).
    // It is reported as a value, not swallowed: callers can tell the difference.
    if (classifyTelegramError(error) === "message_not_modified") return "unchanged";
    throw error;
  }
}

function targetOwner(ctx: BotContext, target: MessageTarget): CallbackOwner {
  return ownerOf(ctx, target.kind === "chat" ? target.chatId : undefined);
}

/**
 * Replaces the content and the keyboard of a message with a rendered card
 * (state changes are edits in place, not new messages). Fresh tokens are
 * issued for the new keyboard; a card without a keyboard removes the old one.
 */
export async function editCard(
  ctx: BotContext,
  target: MessageTarget,
  rendered: RenderedMessage,
): Promise<EditOutcome> {
  const markup = await bindKeyboard(
    rendered.keyboard,
    targetOwner(ctx, target),
    ctx.services.callbacks,
  );
  if (rendered.kind === "rich_html") {
    if (markup !== undefined) throw new PresenterError("editCard: a rich_html card carries its buttons inline");
    const data = await bindRichActions(rendered.actions, targetOwner(ctx, target), ctx.services.callbacks);
    const html = rendered.html.replace(/\{\{cb:(\d+)\}\}/g, (_whole, index: string) => {
      const bound = data[Number(index)];
      if (bound === undefined) throw new PresenterError(`editCard: rich html has no action for placeholder ${index}`);
      return bound;
    });
    return outcomeOf(() =>
      target.kind === "chat"
        ? ctx.api.editMessageText(target.chatId, target.messageId, { html })
        : ctx.api.editMessageTextInline(target.inlineMessageId, { html }),
    );
  }
  const content = rendered.kind === "rich" ? { markdown: rendered.markdown } : rendered.text;
  const other = {
    ...(markup === undefined ? {} : { reply_markup: markup }),
    ...(rendered.kind === "text"
      ? {
          parse_mode: rendered.parseMode,
          link_preview_options: linkPreviewOptions(rendered.linkPreview),
        }
      : {}),
  };
  return outcomeOf(() =>
    target.kind === "chat"
      ? ctx.api.editMessageText(target.chatId, target.messageId, content, other)
      : ctx.api.editMessageTextInline(target.inlineMessageId, content, other),
  );
}

/** Replaces only the keyboard (for example to disable buttons after a choice); `null` removes it. */
export async function editCardMarkup(
  ctx: BotContext,
  target: MessageTarget,
  keyboard: KeyboardSpec | null,
): Promise<EditOutcome> {
  const markup = await bindKeyboard(keyboard, targetOwner(ctx, target), ctx.services.callbacks);
  const other = markup === undefined ? {} : { reply_markup: markup };
  return outcomeOf(() =>
    target.kind === "chat"
      ? ctx.api.editMessageReplyMarkup(target.chatId, target.messageId, other)
      : ctx.api.editMessageReplyMarkupInline(target.inlineMessageId, other),
  );
}

export type AnswerCallbackOptions = {
  /** Show a modal alert instead of a short toast. */
  readonly alert?: boolean;
};

/**
 * Answers the callback query of the update, with an optional toast/alert.
 * Goes through `ctx.answerCallbackQuery`, which the pipeline guards so a
 * query is answered exactly once. Text over 200 characters is a bug in the
 * copy, not something to cut silently.
 */
export async function answerCallback(
  ctx: BotContext,
  text?: string,
  options: AnswerCallbackOptions = {},
): Promise<void> {
  if (ctx.callbackQuery === undefined) {
    throw new PresenterError("answerCallback: the update is not a callback query");
  }
  if (text !== undefined && text.length > CALLBACK_ANSWER_LIMIT) {
    throw new PresenterError(`answerCallback: text is longer than ${CALLBACK_ANSWER_LIMIT} characters`);
  }
  await ctx.answerCallbackQuery({
    ...(text === undefined ? {} : { text }),
    ...(options.alert === true ? { show_alert: true } : {}),
  });
}
