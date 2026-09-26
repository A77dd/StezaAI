import {
  assertValidTimezone,
  fromZoned,
  InvalidIntentError,
  MAX_INTENT_TEXT_LENGTH,
  rangesOverlap,
  toZonedParts,
} from "../domain";
import type { Instant, Intent, IntentKind, IntentParser, Priority } from "../domain";

/**
 * STAND-IN for the LLM intent parser. It implements the same `IntentParser`
 * port with a small, deterministic set of Russian keyword and regex rules so
 * the whole Telegram layer can be tested and demonstrated without a model, a
 * network call or randomness. The production parser will be an LLM adapter
 * behind the same port; nothing in the layer may depend on these rules.
 *
 * What it does
 * - Finds a deadline ("сегодня", "завтра", "послезавтра", weekday names after
 *   "до"/"к"/"в"/"во"/"на" in the matching case, "на этой неделе"), a duration
 *   ("на час", "полчаса", "часа на два", "45 минут", "2 часа", "1.5 часа",
 *   compound "2 часа 30 минут"), a
 *   priority ("срочно", "не срочно"), meeting participants and the kind
 *   (reminder > meeting > follow_up > task > info).
 * - Deadlines are the END of the local day (23:59:00 in the user's timezone).
 *   A weekday always means the next such day strictly after today.
 * - Confidence: 0.9 when a kind and an explicitly written deadline or duration
 *   were found, 0.6 when only a kind was found, 0.3 (kind `info`) when nothing
 *   matched. Default durations (30 minutes for meetings and short review
 *   verbs) are not "found" and do not raise confidence.
 * - It never invents slots, and for `info` it returns no deadline or duration.
 *
 * Known limitations (all deliberate; the LLM parser removes them)
 * - No morphology: titles keep the verb form the user typed ("Посмотри
 *   договор", not "Посмотреть договор"). Participant names are mapped from the
 *   instrumental case to the nominative with a few suffix rules ("Сергеем" ->
 *   "Сергей", "Ольгой" -> "Ольга"); unknown forms and names with dropped
 *   letters ("Петром" -> "Петр") are approximate.
 * - No clock times ("в 15:00"), no calendar dates ("до 5 октября"), no "на
 *   следующей неделе". Relative offsets ("через 2 часа", "на 5 минут позже")
 *   are recognised ONLY to avoid mis-parsing them as durations: they yield no
 *   deadline and no duration and stay in the title.
 * - Only the first deadline phrase and the first duration are used.
 * - Task verbs are matched only in infinitive or imperative form; past tense
 *   ("сделал") is treated as information.
 * - The source (forward, group, hidden origin) is not consulted.
 * - Text longer than `MAX_INTENT_TEXT_LENGTH` (8000) characters is rejected
 *   with `InvalidIntentError`; the caller must cap voice transcripts. All
 *   matching and title cleanup is linear in the input length.
 */

const LETTER = String.raw`\p{L}\p{N}_`;
const START = String.raw`(?<![${LETTER}])`;
const END = String.raw`(?![${LETTER}])`;
const PREFIX = String.raw`(?:(?:до|на|к)\s+)?`;

const END_OF_DAY = { hour: 23, minute: 59 } as const;
const DEFAULT_MEETING_MINUTES = 30;
const DEFAULT_SHORT_TASK_MINUTES = 30;
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 12 * 60;
const MAX_TITLE_LENGTH = 120;

const CONFIDENCE_KIND_AND_DETAIL = 0.9;
const CONFIDENCE_KIND_ONLY = 0.6;
const CONFIDENCE_NOTHING = 0.3;

// --- Small helpers ------------------------------------------------------------

type Span = { start: number; end: number };

function regex(source: string, flags = "giu"): RegExp {
  return new RegExp(source, flags);
}

function matchesAny(source: string, text: string): boolean {
  return regex(source, "iu").test(text);
}

function normalizeWords(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

// --- Numbers ------------------------------------------------------------------

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  один: 1,
  одну: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
  пятнадцать: 15,
  двадцать: 20,
  тридцать: 30,
  "сорок пять": 45,
};

const NUMBER = String.raw`(\d+(?:[.,]\d+)?|сорок\s+пять|пятнадцать|двадцать|тридцать|десять|девять|восемь|четыре|шесть|пять|один|одну|два|две|три|семь)`;

function parseNumber(token: string): number | undefined {
  if (/^\d/.test(token)) return Number.parseFloat(token.replace(",", "."));
  return NUMBER_WORDS[normalizeWords(token)];
}

// --- Duration -------------------------------------------------------------------

type Found<T> = { span: Span; value: T };

const DURATION_PATTERNS: readonly {
  readonly pattern: RegExp;
  readonly minutes: (match: RegExpMatchArray) => number | undefined;
}[] = [
  {
    // "2 часа 30 минут": the longer match at the same start beats "2 часа".
    pattern: regex(
      String.raw`${START}(?:на\s+)?${NUMBER}\s*(?:часа|часов|час|ч)\s+${NUMBER}\s*мин(?:ут[аыу]?)?${END}`,
    ),
    minutes: (match) => {
      const hours = hoursToMinutes(match[1]);
      const minutes = match[2] === undefined ? undefined : parseNumber(match[2]);
      return hours === undefined || minutes === undefined ? undefined : hours + Math.round(minutes);
    },
  },
  {
    pattern: regex(String.raw`${START}(?:на\s+)?полчаса${END}`),
    minutes: () => 30,
  },
  {
    pattern: regex(String.raw`${START}(?:на\s+)?полтора\s+часа${END}`),
    minutes: () => 90,
  },
  {
    // "часа на два" (roughly two hours)
    pattern: regex(String.raw`${START}часа?\s+на\s+${NUMBER}${END}`),
    minutes: (match) => hoursToMinutes(match[1]),
  },
  {
    pattern: regex(String.raw`${START}(?:на\s+)?${NUMBER}\s*(?:часа|часов|час|ч)${END}`),
    minutes: (match) => hoursToMinutes(match[1]),
  },
  {
    pattern: regex(String.raw`${START}на\s+час${END}`),
    minutes: () => 60,
  },
  {
    pattern: regex(String.raw`${START}(?:на\s+)?${NUMBER}\s*мин(?:ут[аыу]?)?${END}`),
    minutes: (match) => {
      const value = match[1] === undefined ? undefined : parseNumber(match[1]);
      return value === undefined ? undefined : Math.round(value);
    },
  },
];

function hoursToMinutes(token: string | undefined): number | undefined {
  const value = token === undefined ? undefined : parseNumber(token);
  return value === undefined ? undefined : Math.round(value * 60);
}

const UNIT_PHRASE = String.raw`(?:${NUMBER}\s*(?:часа|часов|час|ч)(?:\s+${NUMBER}\s*мин(?:ут[аыу]?)?)?|${NUMBER}\s*мин(?:ут[аыу]?)?|полтора\s+часа|полчаса|час)`;
const RELATIVE_OFFSET_PATTERN = regex(
  String.raw`${START}(?:через\s+${UNIT_PHRASE}|(?:на\s+)?${UNIT_PHRASE}\s+(?:позже|раньше|назад))${END}`,
);

/** "через 2 часа", "на 5 минут позже": a point in time, not a length of work. */
function findRelativeOffsets(text: string): Span[] {
  return [...text.matchAll(RELATIVE_OFFSET_PATTERN)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function overlapsAny(span: Span, others: readonly Span[]): boolean {
  return others.some((other) => rangesOverlap(span.start, span.end, other.start, other.end));
}

function findDuration(text: string, relativeOffsets: readonly Span[]): Found<number> | undefined {
  let best: Found<number> | undefined;
  for (const { pattern, minutes } of DURATION_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = minutes(match);
      // Implausible values are left in the title instead of being guessed at.
      if (value === undefined || value < MIN_DURATION_MINUTES || value > MAX_DURATION_MINUTES) {
        continue;
      }
      const span = { start: match.index, end: match.index + match[0].length };
      if (overlapsAny(span, relativeOffsets)) continue;
      if (best === undefined || isBetterSpan(span, best.span)) best = { span, value };
    }
  }
  return best;
}

function isBetterSpan(candidate: Span, current: Span): boolean {
  return (
    candidate.start < current.start ||
    (candidate.start === current.start && candidate.end > current.end)
  );
}

// --- Deadline -------------------------------------------------------------------

const WEEKDAYS: readonly {
  readonly isoWeekday: number;
  readonly genitive: string;
  readonly dative: string;
  readonly accusative: string;
}[] = [
  { isoWeekday: 1, genitive: "понедельника", dative: "понедельнику", accusative: "понедельник" },
  { isoWeekday: 2, genitive: "вторника", dative: "вторнику", accusative: "вторник" },
  { isoWeekday: 3, genitive: "среды", dative: "среде", accusative: "среду" },
  { isoWeekday: 4, genitive: "четверга", dative: "четвергу", accusative: "четверг" },
  { isoWeekday: 5, genitive: "пятницы", dative: "пятнице", accusative: "пятницу" },
  { isoWeekday: 6, genitive: "субботы", dative: "субботе", accusative: "субботу" },
  { isoWeekday: 7, genitive: "воскресенья", dative: "воскресенью", accusative: "воскресенье" },
];

const SUNDAY = 7;

type DeadlinePattern = {
  readonly pattern: RegExp;
  /** Days from the user's local today to the deadline day. */
  readonly daysAhead: (todayIsoWeekday: number) => number;
};

const DEADLINE_PATTERNS: readonly DeadlinePattern[] = [
  { pattern: regex(String.raw`${START}${PREFIX}сегодня${END}`), daysAhead: () => 0 },
  { pattern: regex(String.raw`${START}${PREFIX}завтра${END}`), daysAhead: () => 1 },
  { pattern: regex(String.raw`${START}${PREFIX}послезавтра${END}`), daysAhead: () => 2 },
  {
    pattern: regex(
      String.raw`${START}(?:на\s+(?:этой|текущей)\s+неделе|до\s+конца\s+недели)${END}`,
    ),
    daysAhead: (today) => SUNDAY - today,
  },
  ...WEEKDAYS.map(
    ({ isoWeekday, genitive, dative, accusative }): DeadlinePattern => ({
      pattern: regex(
        String.raw`${START}(?:до\s+${genitive}|к\s+${dative}|(?:в|во|на)\s+${accusative})${END}`,
      ),
      // Always the next such weekday strictly after today (1..7 days ahead).
      daysAhead: (today) => ((isoWeekday - today + 6) % 7) + 1,
    }),
  ),
];

function findDeadline(text: string, now: Instant, timezone: string): Found<Instant> | undefined {
  const today = toZonedParts(now, timezone);
  let best: Found<Instant> | undefined;
  for (const { pattern, daysAhead } of DEADLINE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const span = { start: match.index, end: match.index + match[0].length };
      if (best !== undefined && !isBetterSpan(span, best.span)) continue;
      // Rolling `day + n` over lets `fromZoned` handle month and year ends.
      const value = fromZoned(
        {
          year: today.year,
          month: today.month,
          day: today.day + daysAhead(today.isoWeekday),
          ...END_OF_DAY,
        },
        timezone,
      );
      best = { span, value };
    }
  }
  return best;
}

// --- Kind -----------------------------------------------------------------------

const VERB_FORMS = [
  "подготов(?:ить|ь|ьте)",
  "посмотр(?:еть|и|ите)",
  "сдела(?:ть|й|йте)",
  "напи(?:сать|ши|шите)",
  "отправ(?:ить|ь|ьте)",
  "провер(?:ить|ь|ьте)",
  "оплат(?:ить|и|ите)",
  "куп(?:ить|и|ите)",
  "разобрать|разбери(?:те)?",
  "закончи(?:ть|те)?",
  "доработ(?:ать|ай|айте)",
  "прочита(?:ть|й|йте)",
  "изуч(?:ить|и|ите)",
  "состав(?:ить|ь|ьте)",
  "созда(?:ть|й|йте)",
  "исправ(?:ить|ь|ьте)",
  "заверш(?:ить|и|ите)",
  "позвон(?:ить|и|ите)",
  "ответ(?:ить|ь|ьте)",
  "заполн(?:ить|и|ите)",
  "подпи(?:сать|ши|шите)",
  "согласова(?:ть)|согласу(?:й|йте)",
  "оформ(?:ить|и|ите)",
  "организ(?:овать|уй|уйте)",
].join("|");

const SHORT_TASK_VERBS = String.raw`(?:посмотр(?:еть|и|ите)|провер(?:ить|ь|ьте)|прочита(?:ть|й|йте)|ответ(?:ить|ь|ьте))`;

const REMINDER_RULE = String.raw`${START}(?:напомин[${LETTER}]*|напомн[${LETTER}]*|remind[${LETTER}]*)`;
const MEETING_RULE = String.raw`${START}(?:встреч[${LETTER}]*|встрет[${LETTER}]*|созвон[${LETTER}]*|обсуд[${LETTER}]*|обсужд[${LETTER}]*|митинг[${LETTER}]*|переговор[${LETTER}]*|планерк[${LETTER}]*)`;
const FOLLOW_UP_RULE = String.raw`${START}(?:уточни(?:ть|те)?|узна(?:ть|й|йте)|спроси(?:ть|те)?|вернуться\s+к|follow[- ]?up)${END}`;
const TASK_RULE = String.raw`${START}(?:${VERB_FORMS}|нужно|надо|необходимо|не\s+забуд(?:ь|ьте))${END}`;

function classify(text: string): IntentKind {
  if (matchesAny(REMINDER_RULE, text)) return "reminder";
  if (matchesAny(MEETING_RULE, text)) return "meeting";
  if (matchesAny(FOLLOW_UP_RULE, text)) return "follow_up";
  if (matchesAny(TASK_RULE, text)) return "task";
  return "info";
}

// --- Priority and filler --------------------------------------------------------

const PRIORITY_PATTERN = regex(
  String.raw`${START}(?:не\s+срочно|не\s+важно|неважно|срочн(?:о|ый|ая|ое|ые)|как\s+можно\s+скорее|asap|urgent|важно|когда\s+будет\s+время|без\s+спешки)${END}`,
);
const LOW_PRIORITY_PATTERN = regex(String.raw`^(?:не\s+срочно|не\s+важно|неважно|когда\s+будет\s+время|без\s+спешки)$`, "iu");
const FILLER_PATTERN = regex(String.raw`${START}(?:позже|потом|как-нибудь)${END}`);

function findPriority(text: string): { priority: Priority; spans: Span[] } {
  const spans: Span[] = [];
  let priority: Priority = "normal";
  for (const match of text.matchAll(PRIORITY_PATTERN)) {
    spans.push({ start: match.index, end: match.index + match[0].length });
    if (LOW_PRIORITY_PATTERN.test(normalizeWords(match[0]))) {
      priority = "low";
    } else if (priority === "normal") {
      priority = "high";
    }
  }
  return { priority, spans };
}

// --- Participants ---------------------------------------------------------------

const NAME = String.raw`\p{Lu}\p{Ll}+`;
const PARTICIPANTS_PATTERN = regex(
  String.raw`(?<![${LETTER}])[Сс]о?\s+(${NAME}(?:\s*(?:,|и)\s*${NAME})*)`,
  "u",
);

// Longest suffix first. Approximate instrumental -> nominative for first names.
const NAME_SUFFIX_RULES: readonly (readonly [string, string])[] = [
  ["ием", "ий"],
  ["еем", "ей"],
  ["аем", "ай"],
  ["ией", "ия"],
  ["ой", "а"],
  ["ом", ""],
  ["ем", "ь"],
];

// Forms the suffix rules get wrong (dropped or moved letters).
const NAME_EXCEPTIONS: Readonly<Record<string, string>> = {
  павлом: "Павел",
  львом: "Лев",
  ильей: "Илья",
};

function toNominative(name: string): string {
  const exception = NAME_EXCEPTIONS[normalizeWords(name)];
  if (exception !== undefined) return exception;
  for (const [suffix, replacement] of NAME_SUFFIX_RULES) {
    if (name.length > suffix.length + 1 && name.endsWith(suffix)) {
      return name.slice(0, -suffix.length) + replacement;
    }
  }
  return name;
}

function findParticipants(text: string): string[] {
  const match = PARTICIPANTS_PATTERN.exec(text);
  const names = match?.[1];
  if (names === undefined) return [];
  return [...names.matchAll(regex(NAME))].map((name) => toNominative(name[0]));
}

// --- Title ----------------------------------------------------------------------

// Applied with the sticky flag at a moving position, so stripping is linear.
const LEADING_NOISE = regex(
  String.raw`(?:пожалуйста[\s,]*|(?:нам|мне|тебе|вам|мы)\s+|надо\s+бы\s+|не\s+забуд(?:ь|ьте)[\s,:]*|нужно\s+будет\s+|надо\s+будет\s+|нужно\s+|надо\s+|необходимо\s+|напомни(?:ть|те)?(?:\s+мне)?\s*(?:что\s+|про\s+|о\s+)?|давай\s+)`,
  "iuy",
);
// Whitespace is collapsed to single spaces before trimming, so " " is enough.
const EDGE_CHARACTERS: ReadonlySet<string> = new Set([" ", ",", ".", ";", ":", "!", "?", "…", "—", "–", "-"]);

/** Widens a span to swallow a comma or semicolon that directly precedes it. */
function withLeadingSeparator(text: string, span: Span): Span {
  let index = span.start;
  while (index > 0 && /\s/u.test(text.charAt(index - 1))) index -= 1;
  const previous = text.charAt(index - 1);
  return previous === "," || previous === ";" ? { start: index - 1, end: span.end } : span;
}

function removeSpans(text: string, spans: readonly Span[]): string {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  let result = "";
  let cursor = 0;
  for (const span of sorted) {
    if (span.end <= cursor) continue;
    result += text.slice(cursor, Math.max(span.start, cursor));
    cursor = span.end;
  }
  return result + text.slice(cursor);
}

/** Trims edge punctuation and spaces by index: one pass, no backtracking. */
function trimEdges(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && EDGE_CHARACTERS.has(text.charAt(start))) start += 1;
  while (end > start && EDGE_CHARACTERS.has(text.charAt(end - 1))) end -= 1;
  return text.slice(start, end);
}

function tidy(text: string): string {
  return trimEdges(text.replace(/\s+/gu, " "));
}

/** Drops leading filler ("нам нужно будет", "напомни мне") in one left-to-right pass. */
function stripLeadingNoise(text: string): string {
  let position = 0;
  for (;;) {
    LEADING_NOISE.lastIndex = position;
    const match = LEADING_NOISE.exec(text);
    if (match === null || match[0] === "") break;
    position += match[0].length;
    while (position < text.length && EDGE_CHARACTERS.has(text.charAt(position))) position += 1;
  }
  return text.slice(position);
}

/** Never empty: falls back to the message itself (`original` is trimmed and non-empty). */
function titleOrOriginal(cleaned: string, original: string): string {
  if (cleaned !== "") return cleaned;
  const tidied = tidy(original);
  return tidied !== "" ? tidied : original;
}

function finishTitle(text: string): string {
  const capitalized = text.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase("ru"));
  const characters = Array.from(capitalized);
  return characters.length > MAX_TITLE_LENGTH
    ? `${characters.slice(0, MAX_TITLE_LENGTH - 1).join("")}…`
    : capitalized;
}

function buildTitle(original: string, spans: readonly Span[]): string {
  const title = tidy(stripLeadingNoise(tidy(removeSpans(original, spans))));
  // Nothing useful left ("нужно"): fall back to the message itself, explicitly.
  return finishTitle(titleOrOriginal(title, original));
}

// --- Parser ---------------------------------------------------------------------

export function createRuleBasedIntentParser(): IntentParser {
  return {
    async parse({ text, now, timezone }): Promise<Intent> {
      // Checked before trimming so padding cannot smuggle in a huge message.
      if (text.length > MAX_INTENT_TEXT_LENGTH) {
        throw new InvalidIntentError(
          `Message text is longer than ${MAX_INTENT_TEXT_LENGTH} characters`,
        );
      }
      const original = text.trim();
      if (original === "") {
        throw new InvalidIntentError("Message text is empty");
      }
      assertValidTimezone(timezone);

      const kind = classify(original);
      if (kind === "info") {
        return {
          kind,
          title: finishTitle(titleOrOriginal(tidy(original), original)),
          deadline: null,
          durationMinutes: null,
          priority: "normal",
          participants: [],
          confidence: CONFIDENCE_NOTHING,
        };
      }

      const deadline = findDeadline(original, now, timezone);
      const relativeOffsets = findRelativeOffsets(original);
      const duration = findDuration(original, relativeOffsets);
      const { priority, spans: prioritySpans } = findPriority(original);
      // "позже" inside "на 5 минут позже" belongs to the offset and stays in the title.
      const fillerSpans = [...original.matchAll(FILLER_PATTERN)]
        .map((match) => ({ start: match.index, end: match.index + match[0].length }))
        .filter((span) => !overlapsAny(span, relativeOffsets));

      const removable: Span[] = [...prioritySpans, ...fillerSpans];
      for (const found of [deadline, duration]) {
        if (found !== undefined) removable.push(withLeadingSeparator(original, found.span));
      }

      const isShortTask = kind === "task" && matchesAny(`${START}${SHORT_TASK_VERBS}${END}`, original);
      const defaultMinutes =
        kind === "meeting"
          ? DEFAULT_MEETING_MINUTES
          : isShortTask
            ? DEFAULT_SHORT_TASK_MINUTES
            : null;

      return {
        kind,
        title: buildTitle(original, removable),
        deadline: deadline?.value ?? null,
        durationMinutes: duration?.value ?? defaultMinutes,
        priority,
        participants: kind === "meeting" ? findParticipants(original) : [],
        confidence:
          deadline !== undefined || duration !== undefined
            ? CONFIDENCE_KIND_AND_DETAIL
            : CONFIDENCE_KIND_ONLY,
      };
    },
  };
}
