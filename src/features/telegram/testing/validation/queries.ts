import type { InlineQueryResult, InlineQueryResultsButton } from "grammy/types";
import {
  optionalBoolean,
  optionalInteger,
  optionalString,
  requireRecord,
  requireString,
  utf8Bytes,
} from "./guards";
import type { Payload } from "./guards";
import { assertInlineResult } from "./inlineResults";
import { badRequest } from "./rejection";

/** `answerCallbackQuery.text`: "0-200 characters", counted in UTF-16 code units. */
export const CALLBACK_ANSWER_TEXT_MAX = 200;
/** `answerInlineQuery`: "No more than 50 results per query are allowed". */
export const INLINE_RESULTS_MAX = 50;
const NEXT_OFFSET_MAX_BYTES = 64;
const START_PARAMETER = /^[A-Za-z0-9_-]{1,64}$/;

export type AnswerCallbackQueryRequest = {
  readonly callbackQueryId: string;
  readonly text: string | undefined;
  readonly showAlert: boolean;
};

/**
 * UNVERIFIED: the description for a too long text (MESSAGE_TOO_LONG) and the
 * unit of the 200 character limit (UTF-16 code units here, the strictest
 * reading).
 */
export function readAnswerCallbackQuery(payload: Payload): AnswerCallbackQueryRequest {
  const callbackQueryId = requireString(payload, "callback_query_id", "query ID is invalid");
  const text = optionalString(payload, "text");
  if (text !== undefined && text.length > CALLBACK_ANSWER_TEXT_MAX) throw badRequest("MESSAGE_TOO_LONG");
  const showAlert = optionalBoolean(payload, "show_alert") ?? false;
  optionalInteger(payload, "cache_time", 0);
  optionalString(payload, "url");
  return { callbackQueryId, text, showAlert };
}

function assertResultsButton(value: unknown): asserts value is InlineQueryResultsButton {
  const button = requireRecord(value, "button");
  if (typeof button.text !== "string" || button.text === "") throw badRequest("button text is empty");
  const hasWebApp = button.web_app !== undefined;
  const hasStart = button.start_parameter !== undefined;
  if (hasWebApp === hasStart) {
    throw badRequest("button must use exactly one of web_app and start_parameter");
  }
  if (hasStart) {
    if (typeof button.start_parameter !== "string" || !START_PARAMETER.test(button.start_parameter)) {
      throw badRequest("start_parameter must be 1-64 characters of A-Z a-z 0-9 _ -");
    }
    return;
  }
  const webApp = requireRecord(button.web_app, "button.web_app");
  if (typeof webApp.url !== "string" || !URL.canParse(webApp.url) || new URL(webApp.url).protocol !== "https:") {
    throw badRequest("BUTTON_URL_INVALID");
  }
}

export type AnswerInlineQueryRequest = {
  readonly inlineQueryId: string;
  readonly results: readonly InlineQueryResult[];
  readonly isPersonal: boolean;
  readonly cacheTime: number | undefined;
};

/**
 * `answerInlineQuery`: at most 50 results with unique ids (UNVERIFIED: the
 * reference does not say ids must be unique), `cache_time` of
 * zero or more seconds, `next_offset` of at most 64 bytes, a `button` with
 * exactly one of `web_app` (https) and `start_parameter` (1-64 characters of
 * `A-Za-z0-9_-`).
 * UNVERIFIED: description texts other than RESULTS_TOO_MUCH.
 */
export function readAnswerInlineQuery(payload: Payload): AnswerInlineQueryRequest {
  const inlineQueryId = requireString(payload, "inline_query_id", "query ID is invalid");
  const rawResults = payload.results;
  if (!Array.isArray(rawResults)) throw badRequest("results must be an array");
  if (rawResults.length > INLINE_RESULTS_MAX) throw badRequest("RESULTS_TOO_MUCH");

  const results: InlineQueryResult[] = [];
  const ids = new Set<string>();
  for (const result of rawResults as unknown[]) {
    assertInlineResult(result);
    if (ids.has(result.id)) throw badRequest(`duplicate inline query result id ${result.id}`);
    ids.add(result.id);
    results.push(result);
  }

  const cacheTime = optionalInteger(payload, "cache_time", 0);
  const isPersonal = optionalBoolean(payload, "is_personal") ?? false;
  const nextOffset = optionalString(payload, "next_offset");
  if (nextOffset !== undefined && utf8Bytes(nextOffset) > NEXT_OFFSET_MAX_BYTES) {
    throw badRequest("next_offset can't exceed 64 bytes");
  }
  if (payload.button !== undefined) assertResultsButton(payload.button);
  return { inlineQueryId, results, isPersonal, cacheTime };
}

export type AnswerGuestQueryRequest = {
  readonly guestQueryId: string;
  readonly result: InlineQueryResult;
};

export function readAnswerGuestQuery(payload: Payload): AnswerGuestQueryRequest {
  const guestQueryId = requireString(payload, "guest_query_id", "query ID is invalid");
  const result = payload.result;
  assertInlineResult(result);
  return { guestQueryId, result };
}
