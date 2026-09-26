import type { MessageEntity, User } from "grammy/types";

/**
 * Independent model of the Bot API's message entity rules, used by the fake
 * Bot API. It is written from the documentation (research 5.1, "Formatting
 * options") and must not share code with `render/`: the fake is the oracle
 * that checks what `render/` produced.
 */

export type EntityType = MessageEntity["type"];
type DateTimeFormat = Extract<MessageEntity, { type: "date_time" }>["date_time_format"];

/** Raised for anything Telegram would answer with "can't parse entities". */
export class EntityParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityParseError";
  }
}

// A Record over the union makes the compiler fail here when a new entity type
// appears in the Bot API types, instead of the fake silently rejecting it.
const ENTITY_TYPES: Readonly<Record<EntityType, true>> = {
  mention: true,
  hashtag: true,
  cashtag: true,
  bot_command: true,
  url: true,
  email: true,
  phone_number: true,
  bold: true,
  italic: true,
  underline: true,
  strikethrough: true,
  spoiler: true,
  blockquote: true,
  expandable_blockquote: true,
  code: true,
  pre: true,
  text_link: true,
  text_mention: true,
  custom_emoji: true,
  date_time: true,
};

const FORMATTING: ReadonlySet<EntityType> = new Set<EntityType>([
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "spoiler",
]);

const ALLOWED_LINK_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:", "tg:"]);

function isQuote(type: EntityType): boolean {
  return type === "blockquote" || type === "expandable_blockquote";
}

/**
 * Whether an entity of type `outer` may contain one of type `inner`
 * (research 5.1): formatting entities nest in and around everything except
 * `pre` and `code`; blockquotes do not nest; `pre` only holds the `code`
 * language marker and `code` holds nothing; every other entity (links, custom
 * emoji, dates, auto-detected ones) only holds formatting.
 *
 * UNVERIFIED: Telegram itself silently drops some of these nestings instead of
 * answering with an error. The fake rejects them so a renderer that emits
 * them fails in tests.
 * UNVERIFIED: a blockquote holding a link, `code` or `pre` is accepted; the
 * documentation only forbids nesting quotes.
 */
export function mayContain(outer: EntityType, inner: EntityType): boolean {
  if (outer === "code") return false;
  if (outer === "pre") return inner === "code";
  if (FORMATTING.has(outer)) return inner !== "code" && inner !== "pre";
  if (isQuote(outer)) return !isQuote(inner);
  return FORMATTING.has(inner);
}

/** `date_time_format`: `r` alone, or `w?[dD]?[tT]?` ("Date-time entity formatting"). */
export function isValidDateTimeFormat(format: string): format is DateTimeFormat {
  return /^(?:r|w?[dD]?[tT]?)$/.test(format);
}

/** Whether `href` is an absolute URL Telegram accepts for a text link. */
export function isAcceptedLinkUrl(url: string): boolean {
  return URL.canParse(url) && ALLOWED_LINK_PROTOCOLS.has(new URL(url).protocol);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUser(value: unknown): value is User {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.id) &&
    typeof value.is_bot === "boolean" &&
    typeof value.first_name === "string"
  );
}

function isEntityType(value: unknown): value is EntityType {
  return typeof value === "string" && Object.hasOwn(ENTITY_TYPES, value);
}

function requireBounds(raw: Readonly<Record<string, unknown>>, index: number, textLength: number) {
  const { offset, length } = raw;
  if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0) {
    throw new EntityParseError(`entity ${index}: offset must be a non-negative integer`);
  }
  if (typeof length !== "number" || !Number.isInteger(length) || length < 1) {
    throw new EntityParseError(`entity ${index}: length must be a positive integer`);
  }
  if (offset + length > textLength) {
    throw new EntityParseError(
      `entity ${index}: range ${offset}..${offset + length} is outside the text (${textLength} UTF-16 code units)`,
    );
  }
  return { offset, length };
}

function toEntity(raw: unknown, index: number, textLength: number): MessageEntity {
  if (!isRecord(raw)) throw new EntityParseError(`entity ${index} must be an object`);
  const type = raw.type;
  if (!isEntityType(type)) throw new EntityParseError(`entity ${index}: unknown entity type`);
  const bounds = requireBounds(raw, index, textLength);
  switch (type) {
    case "pre": {
      if (raw.language !== undefined && typeof raw.language !== "string") {
        throw new EntityParseError(`entity ${index}: pre language must be a string`);
      }
      return raw.language === undefined ? { type, ...bounds } : { type, ...bounds, language: raw.language };
    }
    case "text_link": {
      if (typeof raw.url !== "string" || !isAcceptedLinkUrl(raw.url)) {
        throw new EntityParseError(`entity ${index}: text_link needs an http, https or tg url`);
      }
      return { type, ...bounds, url: raw.url };
    }
    case "text_mention": {
      if (!isUser(raw.user)) throw new EntityParseError(`entity ${index}: text_mention needs a user`);
      return { type, ...bounds, user: raw.user };
    }
    case "custom_emoji": {
      if (typeof raw.custom_emoji_id !== "string" || raw.custom_emoji_id === "") {
        throw new EntityParseError(`entity ${index}: custom_emoji needs a custom_emoji_id`);
      }
      return { type, ...bounds, custom_emoji_id: raw.custom_emoji_id };
    }
    case "date_time": {
      const { unix_time: unixTime, date_time_format: format } = raw;
      if (typeof unixTime !== "number" || !Number.isSafeInteger(unixTime) || unixTime < 0) {
        throw new EntityParseError(`entity ${index}: date_time needs a non-negative integer unix_time`);
      }
      if (typeof format !== "string" || !isValidDateTimeFormat(format)) {
        throw new EntityParseError(`entity ${index}: date_time_format must match r|w?[dD]?[tT]?`);
      }
      return { type, ...bounds, unix_time: unixTime, date_time_format: format };
    }
    default:
      return { type, ...bounds };
  }
}

function checkPair(a: MessageEntity, b: MessageEntity, indexA: number, indexB: number): void {
  const aEnd = a.offset + a.length;
  const bEnd = b.offset + b.length;
  if (aEnd <= b.offset || bEnd <= a.offset) return;

  const aContainsB = a.offset <= b.offset && bEnd <= aEnd;
  const bContainsA = b.offset <= a.offset && aEnd <= bEnd;
  if (!aContainsB && !bContainsA) {
    throw new EntityParseError(
      `entities ${indexA} (${a.type}) and ${indexB} (${b.type}) overlap without one containing the other`,
    );
  }

  // Equal ranges have no natural outer entity: the pair is fine if either
  // order is allowed.
  const allowed =
    aContainsB && bContainsA
      ? mayContain(a.type, b.type) || mayContain(b.type, a.type)
      : aContainsB
        ? mayContain(a.type, b.type)
        : mayContain(b.type, a.type);
  if (allowed) return;
  const [outer, inner] = aContainsB && !bContainsA ? [a, b] : [b, a];
  throw new EntityParseError(
    `${inner.type} can't be nested inside ${outer.type} (entity nesting rules, research 5.1)`,
  );
}

/**
 * Validates an `entities` parameter against the text it describes: known
 * types, integer UTF-16 ranges inside the text, the fields each type needs,
 * and that no two entities overlap without one containing the other or break
 * the nesting rules.
 *
 * UNVERIFIED: the maximum number of entities per message is not documented and
 * is not enforced.
 */
export function validateEntities(text: string, raw: unknown): MessageEntity[] {
  if (!Array.isArray(raw)) throw new EntityParseError("entities must be an array");
  const entities = raw.map((entry: unknown, index) => toEntity(entry, index, text.length));
  for (let a = 0; a < entities.length; a += 1) {
    for (let b = a + 1; b < entities.length; b += 1) {
      const first = entities[a];
      const second = entities[b];
      if (first !== undefined && second !== undefined) checkPair(first, second, a, b);
    }
  }
  return entities;
}
