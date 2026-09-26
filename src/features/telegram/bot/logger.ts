import { createRedactor } from "./redaction";

/**
 * Structured logging for the bot pipeline. Logs are data for operators, not a
 * transcript of conversations: message text, captions, names, usernames,
 * callback data and bot tokens never reach a sink (`redaction.ts`). A record
 * is a flat object `{ level, event, ...bindings, ...fields }`.
 *
 * Events are short dotted names (`update.failed`, `callback.unanswered`) so
 * they can be counted and alerted on without parsing sentences.
 */

export type LogValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly LogValue[]
  | { readonly [key: string]: LogValue };

export type LogFields = { readonly [key: string]: LogValue };

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogRecord = LogFields & { readonly level: LogLevel; readonly event: string };

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  /** A logger that adds `bindings` to every record (for example `updateId`). */
  child(bindings: LogFields): Logger;
}

export type LoggerOptions = {
  /** Records below this level are dropped. */
  readonly minLevel?: LogLevel;
  /**
   * Extra field names to redact on top of the built-in list. Matching ignores
   * case, `_` and `-`.
   */
  readonly redact?: readonly string[];
};

const LEVEL_RANK: Readonly<Record<LogLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };

function createLogger(
  write: (record: LogRecord) => void,
  options: Required<Pick<LoggerOptions, "minLevel">> & Pick<LoggerOptions, "redact">,
): Logger {
  const redact = createRedactor(options.redact);

  function build(bindings: LogFields): Logger {
    const emit = (level: LogLevel, event: string, fields: LogFields = {}): void => {
      if (LEVEL_RANK[level] < LEVEL_RANK[options.minLevel]) return;
      // `level` and `event` come last so a field can never spoof them.
      write({ ...redact({ ...bindings, ...fields }), level, event });
    };
    return {
      debug: (event, fields) => emit("debug", event, fields),
      info: (event, fields) => emit("info", event, fields),
      warn: (event, fields) => emit("warn", event, fields),
      error: (event, fields) => emit("error", event, fields),
      child: (extra) => build({ ...bindings, ...extra }),
    };
  }

  return build({});
}

/** One JSON object per line, handed to `sink` (stdout in a host, an array in a test). */
export function createJsonLogger(
  sink: (line: string) => void,
  options: LoggerOptions = {},
): Logger {
  return createLogger((record) => sink(JSON.stringify(record)), {
    minLevel: options.minLevel ?? "info",
    redact: options.redact,
  });
}

export type MemoryLogger = Logger & {
  /** What a sink would have received: already redacted. */
  readonly records: readonly LogRecord[];
  /** All records as JSON, for "this text never appears in the logs" assertions. */
  serialized(): string;
  clear(): void;
};

/**
 * Keeps records in memory for tests. It applies exactly the redaction of the
 * JSON logger, so a test that finds no PII here proves what production emits.
 */
export function createMemoryLogger(options: LoggerOptions = {}): MemoryLogger {
  const records: LogRecord[] = [];
  const logger = createLogger((record) => records.push(record), {
    minLevel: options.minLevel ?? "debug",
    redact: options.redact,
  });
  return {
    ...logger,
    records,
    serialized: () => JSON.stringify(records),
    clear: () => {
      records.length = 0;
    },
  };
}
