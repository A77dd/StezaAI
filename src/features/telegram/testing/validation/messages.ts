import { InputFile } from "grammy";
import type { InlineKeyboardMarkup, LinkPreviewOptions } from "grammy/types";
import type { ParsedText } from "../htmlOracle";
import { readChatTarget, readPrivateChatId } from "./chat";
import type { ChatKind } from "./chat";
import {
  optionalBoolean,
  optionalInteger,
  optionalString,
  requireInteger,
  requireRecord,
} from "./guards";
import type { Payload } from "./guards";
import { assertInlineKeyboard, normalizeInlineMarkup } from "./keyboard";
import { badRequest } from "./rejection";
import { readSendParams } from "./sendParams";
import type { MessageLookup, SendParams } from "./sendParams";
import {
  readDraftText,
  readLinkPreviewOptions,
  readMessageText,
  readOptionalCaption,
} from "./text";

/** Rich messages: "32768 UTF-8 characters" (research 5.2), counted here in UTF-16 code units. */
export const RICH_LIMIT = 32768;
const DELETE_MAX = 100;
const MISSING_MESSAGE_ID = "message identifier is not specified";

/**
 * UNVERIFIED: the rich message limit is documented as "32768 UTF-8
 * characters"; whether that means bytes or characters is unknown, so the fake
 * counts UTF-16 code units (never less than characters, never more than bytes).
 * UNVERIFIED: the 500 block, 16 nesting level, 50 media and 20 column limits
 * of research 5.2 and the grammar of `html` / `markdown` are not checked;
 * `blocks` are only required to be a non-empty array.
 */
export type RichContent = {
  readonly html?: string;
  readonly markdown?: string;
  readonly blocks?: readonly unknown[];
};

export type SendMessageRequest = {
  readonly params: SendParams;
  readonly text: ParsedText;
  readonly linkPreview: LinkPreviewOptions | undefined;
};

export function readSendMessage(payload: Payload, lookup: MessageLookup): SendMessageRequest {
  const params = readSendParams(payload, lookup);
  return {
    params,
    text: readMessageText(payload),
    linkPreview: readLinkPreviewOptions(payload.link_preview_options),
  };
}

/** `InputRichMessage`: exactly one of `html`, `markdown`, `blocks`. */
export function readRichContent(value: unknown): RichContent {
  const rich = requireRecord(value, "rich_message");
  optionalBoolean(rich, "is_rtl");
  optionalBoolean(rich, "skip_entity_detection");
  const html = optionalString(rich, "html") || undefined;
  const markdown = optionalString(rich, "markdown") || undefined;
  if (rich.blocks !== undefined && !Array.isArray(rich.blocks)) {
    throw badRequest("rich_message.blocks must be an array");
  }
  const blocks: readonly unknown[] | undefined =
    Array.isArray(rich.blocks) && rich.blocks.length > 0 ? rich.blocks : undefined;

  if ([html, markdown, blocks].filter((part) => part !== undefined).length !== 1) {
    throw badRequest("rich_message must contain exactly one of html, markdown or blocks");
  }
  if ((html ?? markdown ?? "").length > RICH_LIMIT) throw badRequest("message is too long");
  if (html !== undefined) return { html };
  return markdown === undefined ? { blocks } : { markdown };
}

export type SendRichRequest = { readonly params: SendParams; readonly rich: RichContent };

export function readSendRichMessage(payload: Payload, lookup: MessageLookup): SendRichRequest {
  const params = readSendParams(payload, lookup);
  return { params, rich: readRichContent(payload.rich_message) };
}

export type DraftRequest = {
  readonly chatId: number;
  readonly threadId: number | undefined;
  readonly draftId: number;
  readonly text: ParsedText;
  readonly canStop: boolean;
  readonly keepOnStop: boolean;
};

/**
 * `sendMessageDraft`: private chats only, non-zero `draft_id`, text 0-4096
 * after parsing (empty shows "Thinking...").
 * UNVERIFIED: the description texts for a non-private chat and a bad draft_id.
 */
export function readSendMessageDraft(payload: Payload): DraftRequest {
  const chatId = readPrivateChatId(payload);
  const draftId = payload.draft_id;
  if (typeof draftId !== "number" || !Number.isSafeInteger(draftId) || draftId === 0) {
    throw badRequest("draft_id must be a non-zero integer");
  }
  return {
    chatId,
    threadId: optionalInteger(payload, "message_thread_id", 1),
    draftId,
    text: readDraftText(payload),
    canStop: optionalBoolean(payload, "can_stop") ?? false,
    keepOnStop: optionalBoolean(payload, "keep_on_stop") ?? false,
  };
}

export type EditTarget =
  | { readonly kind: "chat"; readonly chatId: number | string; readonly messageId: number }
  | { readonly kind: "inline"; readonly inlineMessageId: string };

function readEditTarget(payload: Payload): { target: EditTarget; chatKind: ChatKind | undefined } {
  const inlineMessageId = optionalString(payload, "inline_message_id");
  const hasChat = payload.chat_id !== undefined || payload.message_id !== undefined;
  if (inlineMessageId !== undefined) {
    if (hasChat) throw badRequest("chat_id and message_id can't be used together with inline_message_id");
    return { target: { kind: "inline", inlineMessageId }, chatKind: undefined };
  }
  if (payload.chat_id === undefined || payload.message_id === undefined) {
    throw badRequest(MISSING_MESSAGE_ID);
  }
  const chat = readChatTarget(payload);
  const messageId = requireInteger(payload, "message_id", 1, MISSING_MESSAGE_ID);
  return { target: { kind: "chat", chatId: chat.id, messageId }, chatKind: chat.kind };
}

function readEditMarkup(payload: Payload, chatKind: ChatKind | undefined): InlineKeyboardMarkup | null {
  const raw = payload.reply_markup;
  if (raw === undefined) return null;
  assertInlineKeyboard(raw, chatKind === undefined ? {} : { chatKind });
  return normalizeInlineMarkup(raw);
}

export type EditTextRequest = {
  readonly target: EditTarget;
  readonly content:
    | { readonly kind: "text"; readonly text: ParsedText; readonly linkPreview: LinkPreviewOptions | undefined }
    | { readonly kind: "rich"; readonly rich: RichContent };
  /** `null`: no keyboard; a missing `reply_markup` removes the keyboard, as in the real API. */
  readonly markup: InlineKeyboardMarkup | null;
};

/**
 * `editMessageText`: a chat message (`chat_id` + `message_id`) or an inline
 * message, new `text` or `rich_message` (exactly one), inline keyboard only.
 * UNVERIFIED: text and rich_message together are rejected; the reference only
 * says text is "required if rich_message isn't specified".
 */
export function readEditMessageText(payload: Payload): EditTextRequest {
  const { target, chatKind } = readEditTarget(payload);
  const hasRich = payload.rich_message !== undefined;
  if (hasRich && payload.text !== undefined) {
    throw badRequest("text and rich_message can't be used together");
  }
  const markup = readEditMarkup(payload, chatKind);
  if (hasRich) return { target, content: { kind: "rich", rich: readRichContent(payload.rich_message) }, markup };
  return {
    target,
    content: {
      kind: "text",
      text: readMessageText(payload),
      linkPreview: readLinkPreviewOptions(payload.link_preview_options),
    },
    markup,
  };
}

export type EditMarkupRequest = {
  readonly target: EditTarget;
  readonly markup: InlineKeyboardMarkup | null;
};

export function readEditMessageReplyMarkup(payload: Payload): EditMarkupRequest {
  const { target, chatKind } = readEditTarget(payload);
  return { target, markup: readEditMarkup(payload, chatKind) };
}

export type DeleteRequest = { readonly chatId: number | string; readonly messageId: number };

export function readDeleteMessage(payload: Payload): DeleteRequest {
  const chat = readChatTarget(payload);
  return { chatId: chat.id, messageId: requireInteger(payload, "message_id", 1, MISSING_MESSAGE_ID) };
}

export function readDeleteMessages(payload: Payload): {
  readonly chatId: number | string;
  readonly messageIds: readonly number[];
} {
  const chat = readChatTarget(payload);
  const ids = payload.message_ids;
  if (!Array.isArray(ids) || ids.length === 0) throw badRequest("message identifiers are not specified");
  if (ids.length > DELETE_MAX) throw badRequest("too many messages to delete");
  const messageIds = ids.map((id: unknown) => {
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) {
      throw badRequest("message identifiers must be positive integers");
    }
    return id;
  });
  return { chatId: chat.id, messageIds };
}

export type DocumentSource =
  | { readonly kind: "file_id"; readonly fileId: string }
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "upload"; readonly file: InputFile };

export type SendDocumentRequest = {
  readonly params: SendParams;
  readonly document: DocumentSource;
  readonly caption: ParsedText | undefined;
};

function readDocumentSource(value: unknown, knowsFile: (fileId: string) => boolean): DocumentSource {
  if (value === undefined || value === "") throw badRequest("there is no document in the request");
  if (value instanceof InputFile) return { kind: "upload", file: value };
  if (typeof value !== "string") throw badRequest("document must be a file_id, an HTTP URL or an upload");
  if (/^https?:\/\//i.test(value)) {
    // "sendDocument by URL: only .PDF and .ZIP" (research 5.5).
    if (!URL.canParse(value) || !/\.(?:pdf|zip)$/i.test(new URL(value).pathname)) {
      throw badRequest("wrong type of the web page content");
    }
    return { kind: "url", url: value };
  }
  if (!knowsFile(value)) throw badRequest("wrong file identifier/HTTP URL specified");
  return { kind: "file_id", fileId: value };
}

/**
 * `sendDocument` (used by `/export`): an upload, a `file_id` the fake knows or
 * an HTTP URL of a PDF or ZIP, plus an optional caption of 0-1024 characters.
 * UNVERIFIED: the description texts for a wrong file id, a wrong URL type and a
 * missing document (the PDF / ZIP restriction itself is documented).
 */
export function readSendDocument(
  payload: Payload,
  lookup: MessageLookup,
  knowsFile: (fileId: string) => boolean,
): SendDocumentRequest {
  const params = readSendParams(payload, lookup);
  return {
    params,
    document: readDocumentSource(payload.document, knowsFile),
    caption: readOptionalCaption(payload),
  };
}
