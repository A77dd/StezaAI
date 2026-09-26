import type { MessageEntity } from "grammy/types";
import {
  EntityParseError,
  isAcceptedLinkUrl,
  isValidDateTimeFormat,
  mayContain,
} from "./entityRules";

/**
 * Independent parser for Bot API `parse_mode: "HTML"` (research 5.1), written
 * from the documentation and deliberately not sharing code with `render/`.
 * It returns the text the reader sees and the entities Telegram would derive
 * from the markup, or throws `EntityParseError` with the wording of
 * Telegram's "can't parse entities" errors.
 *
 * Stricter than Telegram in three documented places, so renderer bugs surface
 * in tests: `&`, `>` and `<` that are not part of an entity or tag are errors
 * (the docs demand escaping; Telegram leaves stray `&` and `>` literal), the
 * entity nesting rules of research 5.1 are enforced (Telegram drops the
 * entity silently), and unsupported `class` attributes are errors.
 *
 * UNVERIFIED: the exact wording after "can't parse entities:" is modelled on
 * what the real API is known to answer; the documentation lists no error
 * texts. Assert on the prefix, not on the tail.
 */

export type ParsedText = {
  readonly text: string;
  readonly entities: readonly MessageEntity[];
};

type DateTimeFormat = Extract<MessageEntity, { type: "date_time" }>["date_time_format"];
type SimpleType = "bold" | "italic" | "underline" | "strikethrough" | "spoiler";

type EntitySpec =
  | { type: SimpleType | "code" | "blockquote" | "expandable_blockquote" }
  | { type: "pre"; language?: string }
  | { type: "text_link"; url: string }
  | { type: "custom_emoji"; custom_emoji_id: string }
  | { type: "date_time"; unix_time: number; date_time_format: DateTimeFormat };

const SIMPLE_TAGS: Readonly<Record<string, SimpleType>> = {
  b: "bold",
  strong: "bold",
  i: "italic",
  em: "italic",
  u: "underline",
  ins: "underline",
  s: "strikethrough",
  strike: "strikethrough",
  del: "strikethrough",
  "tg-spoiler": "spoiler",
};

const NAMED_ENTITIES: Readonly<Record<string, string>> = { lt: "<", gt: ">", amp: "&", quot: '"' };
const ENTITY_PATTERN = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));/y;
const ATTRIBUTE_PATTERN = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const LANGUAGE_CLASS = /^language-(\S+)$/;

type Frame = {
  readonly tag: string;
  spec: EntitySpec;
  readonly start: number;
  readonly order: number;
  /** A `<code>` directly inside `<pre>`: it only carries the language, no entity of its own. */
  readonly merged: boolean;
};

type Attributes = ReadonlyMap<string, string>;

const encoder = new TextEncoder();

function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/**
 * Reads `&...;` at `index` of `source`, or throws for anything but lt, gt,
 * amp, quot and valid numeric entities. `baseBytes` is the UTF-8 offset of
 * `source` inside the whole message, for error positions.
 */
function readEntity(source: string, index: number, baseBytes: number): { value: string; next: number } {
  ENTITY_PATTERN.lastIndex = index;
  const match = ENTITY_PATTERN.exec(source);
  const at = baseBytes + byteLength(source.slice(0, index));
  if (match === null) {
    throw new EntityParseError(`Unescaped '&' at byte offset ${at}: write &amp;`);
  }
  const [whole, decimal, hex, named] = match;
  const next = index + whole.length;
  if (named !== undefined) {
    const value = NAMED_ENTITIES[named];
    if (value === undefined) {
      throw new EntityParseError(
        `Unsupported HTML entity "${whole}" at byte offset ${at}: only &lt; &gt; &amp; &quot; and numeric entities are supported`,
      );
    }
    return { value, next };
  }
  const codePoint = decimal !== undefined ? Number.parseInt(decimal, 10) : Number.parseInt(hex ?? "", 16);
  const isSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
  if (codePoint === 0 || codePoint > 0x10ffff || isSurrogate) {
    throw new EntityParseError(`Invalid numeric entity "${whole}" at byte offset ${at}`);
  }
  return { value: String.fromCodePoint(codePoint), next };
}

function decodeAttribute(raw: string, tagBytes: number): string {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === "&") {
      const { value, next } = readEntity(raw, i, tagBytes);
      out += value;
      i = next - 1;
    } else {
      out += raw[i];
    }
  }
  return out;
}

function parseAttributes(body: string, tagBytes: number): Attributes {
  const attributes = new Map<string, string>();
  for (const [, name, doubleQuoted, singleQuoted, bare] of body.matchAll(ATTRIBUTE_PATTERN)) {
    if (name === undefined) continue;
    const raw = doubleQuoted ?? singleQuoted ?? bare ?? "";
    attributes.set(name.toLowerCase(), decodeAttribute(raw, tagBytes));
  }
  return attributes;
}

/** Finds the `>` that closes the tag starting at `start`, skipping quoted attribute values. */
function findTagEnd(html: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + 1; i < html.length; i += 1) {
    const char = html[i];
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return i;
    }
  }
  throw new EntityParseError(
    `Can't find end of the entity starting at byte offset ${byteLength(html.slice(0, start))}`,
  );
}

function specFor(
  tag: string,
  attributes: Attributes,
  parent: Frame | undefined,
  at: number,
): { spec: EntitySpec; merged: boolean } {
  const simple = SIMPLE_TAGS[tag];
  if (simple !== undefined) return { spec: { type: simple }, merged: false };
  switch (tag) {
    case "span":
      if (attributes.get("class") !== "tg-spoiler") {
        throw new EntityParseError(
          `Unsupported start tag "span" at byte offset ${at}: only <span class="tg-spoiler"> is supported`,
        );
      }
      return { spec: { type: "spoiler" }, merged: false };
    case "a": {
      const href = attributes.get("href") ?? "";
      if (!isAcceptedLinkUrl(href)) {
        throw new EntityParseError(
          `<a> at byte offset ${at} needs an href attribute with an http, https or tg URL`,
        );
      }
      return { spec: { type: "text_link", url: href }, merged: false };
    }
    case "tg-emoji": {
      const id = attributes.get("emoji-id") ?? "";
      if (!/^\d+$/.test(id)) {
        throw new EntityParseError(`<tg-emoji> at byte offset ${at} needs a numeric emoji-id attribute`);
      }
      return { spec: { type: "custom_emoji", custom_emoji_id: id }, merged: false };
    }
    case "tg-time": {
      const unix = attributes.get("unix") ?? "";
      const format = attributes.get("format") ?? "";
      if (!/^\d+$/.test(unix) || !Number.isSafeInteger(Number(unix))) {
        throw new EntityParseError(`<tg-time> at byte offset ${at} needs a non-negative integer unix attribute`);
      }
      if (!isValidDateTimeFormat(format)) {
        throw new EntityParseError(`<tg-time> at byte offset ${at}: format must match r|w?[dD]?[tT]?`);
      }
      return { spec: { type: "date_time", unix_time: Number(unix), date_time_format: format }, merged: false };
    }
    case "pre":
      return { spec: { type: "pre" }, merged: false };
    case "code": {
      const className = attributes.get("class");
      if (parent?.spec.type === "pre") {
        const language = className === undefined ? undefined : LANGUAGE_CLASS.exec(className)?.[1];
        if (className !== undefined && language === undefined) {
          throw new EntityParseError(`Unsupported class on <code> at byte offset ${at}: expected language-<name>`);
        }
        if (language !== undefined) parent.spec = { type: "pre", language };
        return { spec: { type: "code" }, merged: true };
      }
      if (className !== undefined) {
        throw new EntityParseError(
          `Unsupported class on <code> at byte offset ${at}: only <pre><code class="language-..."> takes one`,
        );
      }
      return { spec: { type: "code" }, merged: false };
    }
    case "blockquote":
      return {
        spec: { type: attributes.has("expandable") ? "expandable_blockquote" : "blockquote" },
        merged: false,
      };
    default:
      throw new EntityParseError(`Unsupported start tag "${tag}" at byte offset ${at}`);
  }
}

/** Parses Telegram HTML into visible text and entities; see the module comment for the rules. */
export function parseTelegramHtml(html: string): ParsedText {
  const stack: Frame[] = [];
  const collected: Array<{ order: number; entity: MessageEntity }> = [];
  let text = "";
  let order = 0;

  const openTag = (tagStart: number, body: string): void => {
    const at = byteLength(html.slice(0, tagStart));
    const name = /^[^\s/>]*/.exec(body)?.[0] ?? "";
    if (body.trimEnd().endsWith("/") || name === "") {
      throw new EntityParseError(`Unsupported start tag "${name}" at byte offset ${at}`);
    }
    const tag = name.toLowerCase();
    const { spec, merged } = specFor(tag, parseAttributes(body.slice(name.length), at), stack.at(-1), at);
    for (const ancestor of stack) {
      if (!mayContain(ancestor.spec.type, spec.type)) {
        throw new EntityParseError(
          `<${tag}> can't be nested inside <${ancestor.tag}> at byte offset ${at} (entity nesting rules, research 5.1)`,
        );
      }
    }
    stack.push({ tag, spec, start: text.length, order, merged });
    order += 1;
  };

  const closeTag = (tagStart: number, body: string): void => {
    const at = byteLength(html.slice(0, tagStart));
    const name = body.slice(1).trim().toLowerCase();
    const frame = stack.pop();
    if (frame === undefined) throw new EntityParseError(`Unexpected end tag at byte offset ${at}`);
    if (frame.tag !== name) {
      throw new EntityParseError(
        `Unmatched end tag at byte offset ${at}, expected "</${frame.tag}>", found "</${name}>"`,
      );
    }
    const length = text.length - frame.start;
    if (frame.merged || length === 0) return;
    collected.push({ order: frame.order, entity: { ...frame.spec, offset: frame.start, length } });
  };

  for (let i = 0; i < html.length; i += 1) {
    const char = html.charAt(i);
    if (char === "<") {
      const end = findTagEnd(html, i);
      const body = html.slice(i + 1, end);
      if (body.startsWith("/")) closeTag(i, body);
      else openTag(i, body);
      i = end;
    } else if (char === "&") {
      const { value, next } = readEntity(html, i, 0);
      text += value;
      i = next - 1;
    } else if (char === ">") {
      throw new EntityParseError(`Unescaped '>' at byte offset ${byteLength(html.slice(0, i))}: write &gt;`);
    } else {
      text += char;
    }
  }

  const unclosed = stack.at(-1);
  if (unclosed !== undefined) {
    throw new EntityParseError(`Can't find end tag corresponding to start tag "${unclosed.tag}"`);
  }

  const entities = collected
    .sort((a, b) => a.entity.offset - b.entity.offset || b.entity.length - a.entity.length || a.order - b.order)
    .map((item) => item.entity);
  return { text, entities };
}
