import { RenderError } from "./errors";
import type { Html } from "./htmlType";

/**
 * Tokenizer for the Telegram HTML this module produces. It is deliberately
 * strict (lower-case tags, only the four named entities and numeric ones, no
 * bare `&`/`<`): trusted fragments come from the builders, so anything else
 * means a forged `Html` value and fails loudly instead of being guessed at.
 *
 * Entities are their own tokens so that measuring and truncating never split
 * one.
 */

export type HtmlToken =
  | {
      readonly kind: "text";
      /** Exactly as written (`&amp;` for an entity token). */
      readonly source: string;
      /** The characters the reader sees (`&` for `&amp;`). */
      readonly text: string;
    }
  | { readonly kind: "open"; readonly name: string; readonly source: string }
  | { readonly kind: "close"; readonly name: string; readonly source: string };

const TAG = /<(\/?)([a-z][a-z-]*)(?:\s[^<>]*)?>/y;
const ENTITY = /&(?:#([0-9]+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot));/y;
const TEXT_RUN = /[^<&]+/y;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
};

const MAX_CODE_POINT = 0x10ffff;
const SURROGATES_START = 0xd800;
const SURROGATES_END = 0xdfff;

function decodeEntity(match: RegExpExecArray): string {
  const [, decimal, hex, named] = match;
  if (named !== undefined) return NAMED_ENTITIES[named] ?? named;
  const codePoint = decimal !== undefined ? Number(decimal) : Number.parseInt(hex ?? "", 16);
  const isValid =
    codePoint > 0 &&
    codePoint <= MAX_CODE_POINT &&
    !(codePoint >= SURROGATES_START && codePoint <= SURROGATES_END);
  if (!isValid) throw new RenderError("HTML contains an invalid numeric character reference");
  return String.fromCodePoint(codePoint);
}

function matchAt(pattern: RegExp, input: string, index: number): RegExpExecArray | null {
  pattern.lastIndex = index;
  return pattern.exec(input);
}

function readToken(input: string, index: number): { token: HtmlToken; end: number } {
  const char = input[index];

  if (char === "<") {
    const tag = matchAt(TAG, input, index);
    if (tag === null) throw new RenderError("HTML contains an unescaped or malformed '<'");
    const [source, slash, name] = tag;
    const token: HtmlToken =
      slash === "/"
        ? { kind: "close", name: name ?? "", source }
        : { kind: "open", name: name ?? "", source };
    return { token, end: index + source.length };
  }

  if (char === "&") {
    const entity = matchAt(ENTITY, input, index);
    if (entity === null) throw new RenderError("HTML contains an unescaped or unsupported '&'");
    const [source] = entity;
    return { token: { kind: "text", source, text: decodeEntity(entity) }, end: index + source.length };
  }

  const run = matchAt(TEXT_RUN, input, index);
  const source = run?.[0] ?? "";
  return { token: { kind: "text", source, text: source }, end: index + source.length };
}

export function tokenizeHtml(html: Html): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  let index = 0;
  while (index < html.length) {
    const { token, end } = readToken(html, index);
    tokens.push(token);
    index = end;
  }
  return tokens;
}

/** Names of all elements opened anywhere in the fragment, at any depth. */
export function openTagNames(html: Html): Set<string> {
  const names = new Set<string>();
  for (const token of tokenizeHtml(html)) {
    if (token.kind === "open") names.add(token.name);
  }
  return names;
}
