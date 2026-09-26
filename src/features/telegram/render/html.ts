import { escapeHtml, escapeHtmlAttribute } from "./escape";
import { RenderError } from "./errors";
import { asHtml } from "./htmlType";
import type { Html } from "./htmlType";
import { openTagNames } from "./htmlTokens";

/**
 * Typed builders for the subset of Telegram HTML the bot uses. Every builder
 * returns branded `Html`, so a message can only be assembled from escaped
 * fragments: user text goes through `text()`, never into markup directly.
 *
 * Entity nesting follows the Bot API rules (research 5.1), applied
 * conservatively where the wording is ambiguous, and is enforced here so a
 * violation fails in tests instead of as "can't parse entities" in production:
 * - `code` and `pre` take plain text, so nothing can be nested inside them;
 * - bold/italic/underline/strikethrough/spoiler may not contain `pre`, `code`
 *   or a blockquote;
 * - a link may not contain another link, a `tg-time`, `pre`, `code` or a
 *   blockquote ("all other entities can't contain each other");
 * - a blockquote may not contain another blockquote;
 * - `tg-time` takes plain fallback text.
 * Nesting is checked on the finished fragments, so it also catches a
 * forbidden element buried inside a `join`/`lines` result.
 */

export const LINE_BREAK = asHtml("\n");
export const BLANK_LINE = asHtml("\n\n");

const ALLOWED_LINK_PROTOCOLS = ["https:", "http:", "tg:"];
const CODE_LANGUAGE = /^[A-Za-z0-9_+#.-]{1,32}$/;
// Bot API "Date-time entity formatting": `r` alone, or weekday/date/time flags in this order.
export const TIME_FORMAT = /^(?:r|w?[dD]?[tT]?)$/;

const FORMATTING_FORBIDS = ["pre", "code", "blockquote"];
const LINK_FORBIDS = ["a", "tg-time", "pre", "code", "blockquote"];
const QUOTE_FORBIDS = ["blockquote"];

function assertNoNested(parent: string, inner: Html, forbidden: readonly string[]): void {
  for (const name of openTagNames(inner)) {
    if (forbidden.includes(name)) {
      throw new RenderError(
        `<${name}> cannot be nested inside ${parent}: Telegram entity nesting rules`,
      );
    }
  }
}

function wrap(tag: string, inner: Html, forbidden: readonly string[]): Html {
  assertNoNested(`<${tag}>`, inner, forbidden);
  return asHtml(`<${tag}>${inner}</${tag}>`);
}

/** User-controlled text, escaped. The only way plain strings enter a message. */
export function text(value: string): Html {
  return asHtml(escapeHtml(value));
}

export function b(inner: Html): Html {
  return wrap("b", inner, FORMATTING_FORBIDS);
}

export function i(inner: Html): Html {
  return wrap("i", inner, FORMATTING_FORBIDS);
}

export function u(inner: Html): Html {
  return wrap("u", inner, FORMATTING_FORBIDS);
}

export function s(inner: Html): Html {
  return wrap("s", inner, FORMATTING_FORBIDS);
}

export function spoiler(inner: Html): Html {
  return wrap("tg-spoiler", inner, FORMATTING_FORBIDS);
}

/** Inline monospace. Plain text on purpose: Telegram allows no entity inside `code`. */
export function code(value: string): Html {
  return asHtml(`<code>${escapeHtml(value)}</code>`);
}

/** Code block, optionally highlighted (`language-<name>`). Plain text on purpose, like `code`. */
export function pre(value: string, language?: string): Html {
  if (language === undefined) return asHtml(`<pre>${escapeHtml(value)}</pre>`);
  if (!CODE_LANGUAGE.test(language)) {
    throw new RenderError("Code language must be 1-32 characters of A-Z a-z 0-9 _ + # . -");
  }
  return asHtml(`<pre><code class="language-${language}">${escapeHtml(value)}</code></pre>`);
}

/**
 * Text link. Only https, http and tg (`tg://user?id=` mentions) are allowed:
 * anything else (`javascript:`, `data:`, `file:`...) is rejected rather than
 * passed on. The address is normalised by `URL` and escaped for the attribute.
 * The error never repeats the address, which may be user supplied.
 */
export function link(label: Html, url: string): Html {
  assertNoNested("<a>", label, LINK_FORBIDS);
  if (!URL.canParse(url)) throw new RenderError("Link address is not an absolute URL");
  const parsed = new URL(url);
  if (!ALLOWED_LINK_PROTOCOLS.includes(parsed.protocol)) {
    throw new RenderError("Link address must use https, http or tg");
  }
  return asHtml(`<a href="${escapeHtmlAttribute(parsed.href)}">${label}</a>`);
}

/** Block quote; `expandable` collapses long content behind a "show more" tap. */
export function quote(inner: Html, options: { readonly expandable?: boolean } = {}): Html {
  assertNoNested("<blockquote>", inner, QUOTE_FORBIDS);
  const open = options.expandable === true ? "<blockquote expandable>" : "<blockquote>";
  return asHtml(`${open}${inner}</blockquote>`);
}

/**
 * `<tg-time>`: every reader sees the moment in their own timezone and locale.
 * `fallbackText` is what clients that do not support the entity show, so it
 * must read well on its own (use the user's timezone). An empty format shows
 * the fallback as is and is written without the attribute.
 */
export function timeTag(unixSeconds: number, format: string, fallbackText: string): Html {
  if (!Number.isSafeInteger(unixSeconds) || unixSeconds < 0) {
    throw new RenderError("Unix time must be a non-negative integer number of seconds");
  }
  if (!TIME_FORMAT.test(format)) {
    throw new RenderError("Time format must match r|w?[dD]?[tT]?");
  }
  const formatAttribute = format === "" ? "" : ` format="${format}"`;
  return asHtml(`<tg-time unix="${unixSeconds}"${formatAttribute}>${escapeHtml(fallbackText)}</tg-time>`);
}

export function join(parts: readonly Html[], separator: Html = asHtml("")): Html {
  return asHtml(parts.join(separator));
}

/** Fragments on consecutive lines. */
export function lines(...parts: readonly Html[]): Html {
  return join(parts, LINE_BREAK);
}
