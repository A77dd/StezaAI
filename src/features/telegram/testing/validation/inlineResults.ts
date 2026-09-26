import type { InlineQueryResult } from "grammy/types";
import { isRecord, requireRecord, utf8Bytes } from "./guards";
import type { Payload } from "./guards";
import { assertInlineKeyboard } from "./keyboard";
import { badRequest } from "./rejection";
import { readRichContent } from "./messages";
import { readInputMessageText, readLinkPreviewOptions, readOptionalCaption } from "./text";

/**
 * Inline query result validation for `answerInlineQuery` and
 * `answerGuestQuery` (Bot API `InlineQueryResult` reference): a known `type`,
 * an `id` of 1-64 bytes, the fields each type requires, a caption of at most
 * 1024 characters, an inline keyboard and a valid `input_message_content`
 * (text 1-4096 after parsing).
 *
 * UNVERIFIED: "required" follows the field lists of the reference (URL forms
 * need a thumbnail, cached forms need a `file_id`); URLs are not checked for
 * reachability or MIME type. Invoice contents are not modelled.
 */

export const RESULT_ID_MAX_BYTES = 64;

/** Alternatives: a result must satisfy at least one list of present fields. */
const REQUIRED_FIELDS: Readonly<Record<string, readonly (readonly string[])[]>> = {
  article: [["title", "input_message_content"]],
  photo: [["photo_url", "thumbnail_url"], ["photo_file_id"]],
  gif: [["gif_url", "thumbnail_url"], ["gif_file_id"]],
  mpeg4_gif: [["mpeg4_url", "thumbnail_url"], ["mpeg4_file_id"]],
  video: [
    ["video_url", "mime_type", "thumbnail_url", "title"],
    ["video_file_id", "title"],
  ],
  audio: [["audio_url", "title"], ["audio_file_id"]],
  voice: [["voice_url", "title"], ["voice_file_id", "title"]],
  document: [
    ["title", "document_url", "mime_type"],
    ["title", "document_file_id"],
  ],
  location: [["latitude", "longitude", "title"]],
  venue: [["latitude", "longitude", "title", "address"]],
  contact: [["phone_number", "first_name"]],
  game: [["game_short_name"]],
  sticker: [["sticker_file_id"]],
};

function isPresent(result: Payload, key: string): boolean {
  return result[key] !== undefined && result[key] !== "";
}

function isNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function assertInputContent(value: unknown): void {
  const content = requireRecord(value, "input_message_content");
  if (content.message_text !== undefined) {
    readInputMessageText(content);
    readLinkPreviewOptions(content.link_preview_options);
    return;
  }
  if (content.rich_message !== undefined) {
    readRichContent(content.rich_message);
    return;
  }
  if (isNumber(content.latitude) && isNumber(content.longitude)) {
    const isVenue = content.title !== undefined || content.address !== undefined;
    if (isVenue && !(isPresent(content, "title") && isPresent(content, "address"))) {
      throw badRequest("venue content needs a title and an address");
    }
    return;
  }
  if (typeof content.phone_number === "string" && typeof content.first_name === "string") return;
  throw badRequest("input_message_content is invalid or not modelled by the fake Bot API");
}

/** Asserts one `InlineQueryResult`; the result id is checked here, uniqueness by the caller. */
export function assertInlineResult(value: unknown): asserts value is InlineQueryResult {
  if (!isRecord(value)) throw badRequest("inline query result must be an object");
  const { type, id } = value;
  const alternatives = typeof type === "string" ? REQUIRED_FIELDS[type] : undefined;
  if (alternatives === undefined) throw badRequest("inline query result has an unknown type");
  if (typeof id !== "string" || id === "" || utf8Bytes(id) > RESULT_ID_MAX_BYTES) {
    throw badRequest("inline query result id must be 1-64 bytes");
  }
  if (!alternatives.some((fields) => fields.every((field) => isPresent(value, field)))) {
    throw badRequest(`inline query result of type ${type as string} is missing required fields`);
  }
  readOptionalCaption(value);
  if (value.reply_markup !== undefined) assertInlineKeyboard(value.reply_markup);
  if (value.input_message_content !== undefined) assertInputContent(value.input_message_content);
}
