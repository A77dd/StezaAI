// Server-only: this module reads secrets. Never import it from client
// components or code that ships to the browser.

export const TELEGRAM_MODES = ["webhook", "polling"] as const;
export const TELEGRAM_ENVIRONMENTS = ["development", "test", "production"] as const;

export type TelegramMode = (typeof TELEGRAM_MODES)[number];
export type TelegramEnvironment = (typeof TELEGRAM_ENVIRONMENTS)[number];

type TelegramConfigBase = {
  readonly token: string;
  readonly botUsername: string;
  readonly environment: TelegramEnvironment;
  readonly apiRoot?: string;
  readonly miniAppUrl?: string;
  readonly cronSecret?: string;
};

/** Webhook mode always carries a secret; polling mode may omit it. */
export type TelegramConfig = TelegramConfigBase &
  (
    | { readonly mode: "webhook"; readonly webhookSecret: string }
    | { readonly mode: "polling"; readonly webhookSecret?: string }
  );

/**
 * Thrown when the Telegram environment is invalid. `problems` lists every
 * issue found. Messages name variables and rules only; they never contain the
 * values of the variables, so the error is safe to log.
 */
export class TelegramConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      `Invalid Telegram configuration:\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
    );
    this.name = "TelegramConfigError";
    this.problems = Object.freeze([...problems]);
  }
}

type Env = Record<string, string | undefined>;

const TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]{35,}$/;
// Telegram allows 1-256 characters of A-Z, a-z, 0-9, "_" and "-" in secret_token.
const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;
const CRON_SECRET_PATTERN = /^[A-Za-z0-9_-]{16,}$/;
const WHITESPACE_PROBLEM = "must not have leading or trailing whitespace";
// URL.hostname keeps the brackets of an IPv6 literal.
const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

function isOneOf<T extends string>(
  allowed: readonly T[],
  value: string | undefined,
): value is T {
  return allowed.some((candidate) => candidate === value);
}

function parseUrl(value: string): URL | undefined {
  return URL.canParse(value) ? new URL(value) : undefined;
}

function hasCredentials(url: URL): boolean {
  return url.username !== "" || url.password !== "";
}

function hasWhitespaceAround(value: string): boolean {
  return value !== value.trim();
}

/**
 * Parses and validates the Telegram environment variables. Empty strings are
 * treated as unset (`.env` files commonly declare `NAME=`). There are no
 * defaults for `TELEGRAM_MODE` and `TELEGRAM_ENV`: the operator must choose.
 *
 * Environment rules (the test environment is kept deliberately simple):
 * - `TELEGRAM_ENV=test` requires `TELEGRAM_API_ROOT` to be unset or a
 *   localhost / 127.0.0.1 URL. Telegram's own test environment is reached
 *   through `/bot<token>/test/METHOD` on the official API and uses separate
 *   test-account tokens; this layer does not support that path so that test
 *   and production tokens can never reach the production API by accident.
 * - `production` requires webhook mode, a webhook secret, a cron secret and
 *   an https API root when one is set.
 *
 * `TELEGRAM_API_ROOT` is returned normalized (origin plus path, without
 * trailing slashes) so the Bot API client never builds `//bot<token>` URLs.
 */
export function parseTelegramConfig(env: Env): TelegramConfig {
  const problems: string[] = [];
  const read = (name: string): string | undefined => {
    const value = env[name];
    return value === undefined || value === "" ? undefined : value;
  };

  const token = read("TELEGRAM_BOT_TOKEN");
  if (token === undefined) {
    problems.push("TELEGRAM_BOT_TOKEN is required");
  } else if (!TOKEN_PATTERN.test(token)) {
    problems.push(
      "TELEGRAM_BOT_TOKEN must look like <digits>:<at least 35 letters, digits, '_' or '-'>",
    );
  }

  const botUsername = read("TELEGRAM_BOT_USERNAME");
  if (botUsername === undefined) {
    problems.push("TELEGRAM_BOT_USERNAME is required");
  } else if (
    !USERNAME_PATTERN.test(botUsername) ||
    !botUsername.toLowerCase().endsWith("bot")
  ) {
    problems.push(
      "TELEGRAM_BOT_USERNAME must be 5-32 letters, digits or '_', end with 'bot', and be given without '@'",
    );
  }

  const modeValue = read("TELEGRAM_MODE");
  let mode: TelegramMode | undefined;
  if (modeValue === undefined) {
    problems.push("TELEGRAM_MODE is required (webhook or polling)");
  } else if (isOneOf(TELEGRAM_MODES, modeValue)) {
    mode = modeValue;
  } else {
    problems.push(`TELEGRAM_MODE must be one of: ${TELEGRAM_MODES.join(", ")}`);
  }

  const environmentValue = read("TELEGRAM_ENV");
  let environment: TelegramEnvironment | undefined;
  if (environmentValue === undefined) {
    problems.push("TELEGRAM_ENV is required (development, test or production)");
  } else if (isOneOf(TELEGRAM_ENVIRONMENTS, environmentValue)) {
    environment = environmentValue;
  } else {
    problems.push(
      `TELEGRAM_ENV must be one of: ${TELEGRAM_ENVIRONMENTS.join(", ")}`,
    );
  }

  const isProduction = environment === "production";
  const isTest = environment === "test";

  const webhookSecret = read("TELEGRAM_WEBHOOK_SECRET");
  if (webhookSecret === undefined) {
    if (mode === "webhook" || isProduction) {
      problems.push(
        "TELEGRAM_WEBHOOK_SECRET is required in webhook mode and in production",
      );
    }
  } else if (!WEBHOOK_SECRET_PATTERN.test(webhookSecret)) {
    problems.push(
      "TELEGRAM_WEBHOOK_SECRET must be 1-256 characters of letters, digits, '_' or '-'",
    );
  }
  if (webhookSecret !== undefined && webhookSecret === token) {
    problems.push("TELEGRAM_WEBHOOK_SECRET must differ from TELEGRAM_BOT_TOKEN");
  }

  if (isProduction && mode === "polling") {
    problems.push("production requires TELEGRAM_MODE=webhook");
  }

  const cronSecret = read("TELEGRAM_CRON_SECRET");
  if (cronSecret === undefined) {
    if (isProduction) problems.push("TELEGRAM_CRON_SECRET is required in production");
  } else if (hasWhitespaceAround(cronSecret)) {
    problems.push(`TELEGRAM_CRON_SECRET ${WHITESPACE_PROBLEM}`);
  } else if (!CRON_SECRET_PATTERN.test(cronSecret)) {
    problems.push(
      "TELEGRAM_CRON_SECRET must be at least 16 characters of letters, digits, '_' or '-'",
    );
  }

  const rawApiRoot = read("TELEGRAM_API_ROOT");
  let apiRoot: string | undefined;
  if (rawApiRoot !== undefined) {
    const url = parseUrl(rawApiRoot);
    if (hasWhitespaceAround(rawApiRoot)) {
      problems.push(`TELEGRAM_API_ROOT ${WHITESPACE_PROBLEM}`);
    } else if (
      url === undefined ||
      (url.protocol !== "https:" && url.protocol !== "http:")
    ) {
      problems.push("TELEGRAM_API_ROOT must be a valid http(s) URL");
    } else if (hasCredentials(url) || url.search !== "" || url.hash !== "") {
      problems.push(
        "TELEGRAM_API_ROOT must not contain credentials, a query string or a fragment",
      );
    } else {
      if (isProduction && url.protocol !== "https:") {
        problems.push("TELEGRAM_API_ROOT must use https in production");
      }
      if (isTest && !LOCAL_HOSTNAMES.has(url.hostname)) {
        problems.push(
          "TELEGRAM_ENV=test requires TELEGRAM_API_ROOT to be unset or a localhost / 127.0.0.1 / [::1] URL",
        );
      }
      apiRoot = `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
    }
  }

  const miniAppUrl = read("TELEGRAM_MINI_APP_URL");
  if (miniAppUrl !== undefined) {
    if (hasWhitespaceAround(miniAppUrl)) {
      problems.push(`TELEGRAM_MINI_APP_URL ${WHITESPACE_PROBLEM}`);
    } else {
      const url = parseUrl(miniAppUrl);
      if (url?.protocol !== "https:") {
        problems.push("TELEGRAM_MINI_APP_URL must be an https URL");
      } else if (hasCredentials(url)) {
        problems.push("TELEGRAM_MINI_APP_URL must not contain credentials");
      }
    }
  }

  if (
    problems.length > 0 ||
    token === undefined ||
    botUsername === undefined ||
    mode === undefined ||
    environment === undefined
  ) {
    throw new TelegramConfigError(problems);
  }

  const shared = {
    token,
    botUsername,
    environment,
    ...(apiRoot !== undefined && { apiRoot }),
    ...(miniAppUrl !== undefined && { miniAppUrl }),
    ...(cronSecret !== undefined && { cronSecret }),
  };

  if (mode === "webhook") {
    if (webhookSecret === undefined) {
      // Unreachable: the checks above already report a missing secret.
      throw new TelegramConfigError([
        "TELEGRAM_WEBHOOK_SECRET is required in webhook mode",
      ]);
    }
    return Object.freeze({ ...shared, mode, webhookSecret });
  }
  return Object.freeze({
    ...shared,
    mode,
    ...(webhookSecret !== undefined && { webhookSecret }),
  });
}
