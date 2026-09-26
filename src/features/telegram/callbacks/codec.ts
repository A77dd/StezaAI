import { isCallbackAction } from "./actions";
import type { CallbackAction } from "./actions";
import {
  CallbackMalformedError,
  CallbackTooLongError,
  CallbackUnknownActionError,
  CallbackVersionError,
} from "./errors";

/**
 * `callback_data` codec: `v1:<action>:<token>`. The token is an opaque
 * server-side reference (see `CallbackStore`), never a payload. Telegram limits
 * `InlineKeyboardButton.callback_data` to 1-64 BYTES (not characters), so the
 * size is measured on the UTF-8 encoding.
 */

export const CALLBACK_VERSION = 1;
export const MAX_CALLBACK_DATA_BYTES = 64;
export const MIN_TOKEN_LENGTH = 8;
export const MAX_TOKEN_LENGTH = 32;

const PREFIX = `v${CALLBACK_VERSION}`;
const VERSION_PATTERN = /^v[0-9]+$/;
const ACTION_PATTERN = /^[a-z][a-z.]*$/;
const TOKEN_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${MIN_TOKEN_LENGTH},${MAX_TOKEN_LENGTH}}$`);

const encoder = new TextEncoder();

export type DecodedCallbackData = {
  readonly version: typeof CALLBACK_VERSION;
  readonly action: CallbackAction;
  readonly token: string;
};

/**
 * Throws `CallbackUnknownActionError`, then `CallbackTooLongError` (measured
 * in UTF-8 bytes, before any charset check), then `CallbackMalformedError`
 * for a token outside `[A-Za-z0-9_-]{8,32}`.
 */
export function encodeCallbackData(action: CallbackAction, token: string): string {
  if (!isCallbackAction(action)) {
    throw new CallbackUnknownActionError();
  }
  const data = `${PREFIX}:${action}:${token}`;
  if (encoder.encode(data).length > MAX_CALLBACK_DATA_BYTES) {
    throw new CallbackTooLongError();
  }
  if (!TOKEN_PATTERN.test(token)) {
    throw new CallbackMalformedError("Callback token must match [A-Za-z0-9_-]{8,32}");
  }
  return data;
}

/**
 * Strict parser for client-controlled data: exactly three non-empty parts, a
 * registered action and a token of the allowed charset and length. A future
 * version (`v2:...`) is reported as unsupported before its shape is judged.
 * Error messages never echo the input.
 */
export function decodeCallbackData(data: string): DecodedCallbackData {
  const [version, action, token, ...rest] = data.split(":");
  if (version !== undefined && VERSION_PATTERN.test(version) && version !== PREFIX) {
    throw new CallbackVersionError();
  }
  if (
    version !== PREFIX ||
    action === undefined ||
    token === undefined ||
    rest.length > 0 ||
    encoder.encode(data).length > MAX_CALLBACK_DATA_BYTES ||
    !ACTION_PATTERN.test(action) ||
    !TOKEN_PATTERN.test(token)
  ) {
    throw new CallbackMalformedError();
  }
  if (!isCallbackAction(action)) {
    throw new CallbackUnknownActionError();
  }
  return { version: CALLBACK_VERSION, action, token };
}
