import type { KeyboardSpec } from "./buttonSpec";
import { MessageTooLongError, RenderError } from "./errors";
import { sanitizeText } from "./escape";
import { assertValidKeyboard } from "./keyboard";
import { RICH_LIMIT } from "./limits";
import type { RenderedRichMessage } from "./rendered";

/**
 * Wraps Rich Markdown (for example an LLM's answer or an agenda table) for
 * `sendRichMessage`. Markdown is passed through as written, not escaped or
 * rewritten: this only checks what Telegram would reject anyway, so the
 * failure happens here with a typed error. Length is counted in UTF-16 code
 * units, never lower than characters, so the check errs on the safe side.
 * NUL and lone surrogates follow the same policy as `escapeHtml`.
 */
export function renderRichMarkdown(
  markdown: string,
  keyboard?: KeyboardSpec,
): RenderedRichMessage {
  const clean = sanitizeText(markdown);
  if (clean.trim() === "") throw new RenderError("Rich message cannot be empty");
  if (clean.length > RICH_LIMIT) throw new MessageTooLongError(RICH_LIMIT, clean.length);
  if (keyboard !== undefined) assertValidKeyboard(keyboard);
  return { kind: "rich", markdown: clean, keyboard: keyboard ?? null };
}
