export const TELEGRAM_MODES = ["webhook", "polling"] as const;
export const TELEGRAM_ENVIRONMENTS = ["development", "test", "production"] as const;

export type TelegramMode = (typeof TELEGRAM_MODES)[number];
export type TelegramEnvironment = (typeof TELEGRAM_ENVIRONMENTS)[number];

export type TelegramConfig = {
  readonly token: string;
  readonly webhookSecret?: string;
  readonly botUsername: string;
  readonly mode: TelegramMode;
  readonly environment: TelegramEnvironment;
  readonly isTestEnvironment: boolean;
  readonly isProduction: boolean;
  readonly apiRoot?: string;
  readonly miniAppUrl?: string;
  readonly cronSecret?: string;
};

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
const MIN_CRON_SECRET_LENGTH = 16;
const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);

function isOneOf<T extends string>(
  allowed: readonly T[],
  value: string | undefined,
): value is T {
  return allowed.some((candidate) => candidate === value);
}

function parseUrl(value: string): URL | undefined {
  return URL.canParse(value) ? new URL(value) : undefined;
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
  } else if (cronSecret.length < MIN_CRON_SECRET_LENGTH) {
    problems.push(
      `TELEGRAM_CRON_SECRET must be at least ${MIN_CRON_SECRET_LENGTH} characters`,
    );
  }

  const apiRoot = read("TELEGRAM_API_ROOT");
  if (apiRoot !== undefined) {
    const url = parseUrl(apiRoot);
    if (url === undefined || (url.protocol !== "https:" && url.protocol !== "http:")) {
      problems.push("TELEGRAM_API_ROOT must be a valid http(s) URL");
    } else {
      if (isProduction && url.protocol !== "https:") {
        problems.push("TELEGRAM_API_ROOT must use https in production");
      }
      if (environment === "test" && !LOCAL_HOSTNAMES.has(url.hostname)) {
        problems.push(
          "TELEGRAM_ENV=test requires TELEGRAM_API_ROOT to be unset or a localhost / 127.0.0.1 URL",
        );
      }
    }
  }

  const miniAppUrl = read("TELEGRAM_MINI_APP_URL");
  if (miniAppUrl !== undefined && parseUrl(miniAppUrl)?.protocol !== "https:") {
    problems.push("TELEGRAM_MINI_APP_URL must be an https URL");
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

  return Object.freeze({
    token,
    botUsername,
    mode,
    environment,
    isTestEnvironment: environment === "test",
    isProduction,
    ...(webhookSecret !== undefined && { webhookSecret }),
    ...(apiRoot !== undefined && { apiRoot }),
    ...(miniAppUrl !== undefined && { miniAppUrl }),
    ...(cronSecret !== undefined && { cronSecret }),
  });
}
