import { CALLBACK_ACTIONS, isCallbackAction } from "../callbacks";
import type { CallbackAction, CallbackPayload } from "../callbacks";
import type {
  ActionButtonSpec,
  ButtonSpec,
  ButtonStyle,
  CopyTextButtonSpec,
  DisabledButtonSpec,
  SwitchInlineButtonSpec,
  SwitchInlineMode,
  UrlButtonSpec,
  WebAppButtonSpec,
} from "./buttonSpec";
import { RenderError } from "./errors";
import { sanitizeText } from "./escape";
import { BUTTON_TEXT_LIMIT, COPY_TEXT_LIMIT, INLINE_QUERY_LIMIT } from "./limits";

/**
 * Button constructors. Each validates what it builds, so an invalid button
 * fails where it is written, and `validateButton` re-checks hand-built data.
 * Labels are NOT HTML-escaped: `reply_markup` is JSON, not parse-mode text.
 */

function codePointCount(value: string): number {
  return Array.from(value).length;
}

function assertClean(value: string, what: string): void {
  if (sanitizeText(value) !== value) {
    throw new RenderError(`${what} contains a NUL character or an unpaired surrogate`);
  }
}

function assertHttpsUrl(url: string, what: string): void {
  if (!URL.canParse(url) || new URL(url).protocol !== "https:") {
    throw new RenderError(`${what} must be an absolute https URL`);
  }
}

/**
 * Label: 1-64 code points (an approximation of visible characters). The limit
 * is a readability rule: Telegram accepts longer text but truncates it on
 * screen, hiding the end of the label.
 */
function assertLabel(text: string): void {
  assertClean(text, "Button text");
  const length = codePointCount(text);
  if (text.trim() === "" || length > BUTTON_TEXT_LIMIT) {
    throw new RenderError(`Button text must be 1-${BUTTON_TEXT_LIMIT} visible characters`);
  }
}

/** Throws `RenderError` when the button breaks a Telegram or team rule; returns it otherwise. */
export function validateButton(button: ButtonSpec): ButtonSpec {
  assertLabel(button.text);
  switch (button.kind) {
    case "url":
    case "web_app":
      assertHttpsUrl(button.url, `${button.kind} button address`);
      break;
    case "copy_text":
      assertClean(button.copyText, "Copy text");
      // Telegram: "1-256 characters". UTF-16 units are never fewer than characters.
      if (button.copyText.length < 1 || button.copyText.length > COPY_TEXT_LIMIT) {
        throw new RenderError(`Copy text must be 1-${COPY_TEXT_LIMIT} characters`);
      }
      break;
    case "switch_inline":
      assertClean(button.query, "Inline query");
      if (button.query.length > INLINE_QUERY_LIMIT) {
        throw new RenderError(`Inline query must be at most ${INLINE_QUERY_LIMIT} characters`);
      }
      break;
    case "action":
      // Same check the callback layer runs when it issues a token, so a bad
      // payload fails where the button is written, not when it is pressed.
      if (!isCallbackAction(button.action) || !CALLBACK_ACTIONS[button.action].validate(button.payload)) {
        throw new RenderError("Action button has an unknown action or a payload the registry rejects");
      }
      break;
    case "disabled":
      break;
  }
  return button;
}

export function actionButton<A extends CallbackAction>(
  text: string,
  action: A,
  payload: CallbackPayload<A>,
  style?: ButtonStyle,
): ButtonSpec {
  // TypeScript cannot correlate `action` and `payload` through the generic
  // when building the mapped union; the signature already guarantees it.
  const button = {
    kind: "action",
    text,
    action,
    payload,
    ...(style === undefined ? {} : { style }),
  } as ActionButtonSpec;
  return validateButton(button);
}

export function urlButton(text: string, url: string): ButtonSpec {
  const button: UrlButtonSpec = { kind: "url", text, url };
  return validateButton(button);
}

export function webAppButton(text: string, url: string): ButtonSpec {
  const button: WebAppButtonSpec = { kind: "web_app", text, url };
  return validateButton(button);
}

export function copyButton(text: string, copyText: string): ButtonSpec {
  const button: CopyTextButtonSpec = { kind: "copy_text", text, copyText };
  return validateButton(button);
}

export function switchInlineButton(text: string, query: string, mode: SwitchInlineMode): ButtonSpec {
  const button: SwitchInlineButtonSpec = { kind: "switch_inline", text, query, mode };
  return validateButton(button);
}

export function disabledButton(text: string): ButtonSpec {
  const button: DisabledButtonSpec = { kind: "disabled", text };
  return validateButton(button);
}
