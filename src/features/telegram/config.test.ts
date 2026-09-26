import { describe, expect, it } from "vitest";
import { parseTelegramConfig, TelegramConfigError } from "./config";

const TOKEN = "123456789:TEST_TOKEN_PLACEHOLDER_aaaaaaaaaaaaaaaaaaaaaaaa";
const WEBHOOK_SECRET = "webhook_placeholder_value_0001";
const CRON_SECRET = "cron_placeholder_value_0001";

const webhookEnv = {
  TELEGRAM_BOT_TOKEN: TOKEN,
  TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
  TELEGRAM_BOT_USERNAME: "steza_test_bot",
  TELEGRAM_MODE: "webhook",
  TELEGRAM_ENV: "development",
};

const pollingEnv = {
  TELEGRAM_BOT_TOKEN: TOKEN,
  TELEGRAM_BOT_USERNAME: "steza_test_bot",
  TELEGRAM_MODE: "polling",
  TELEGRAM_ENV: "development",
};

const productionEnv = {
  ...webhookEnv,
  TELEGRAM_ENV: "production",
  TELEGRAM_CRON_SECRET: CRON_SECRET,
};

function without<T extends Record<string, string | undefined>>(
  env: T,
  ...names: string[]
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => !names.includes(name)),
  );
}

function problemsOf(env: Record<string, string | undefined>): string[] {
  try {
    parseTelegramConfig(env);
  } catch (error) {
    if (error instanceof TelegramConfigError) return [...error.problems];
    throw error;
  }
  throw new Error("Expected parseTelegramConfig to throw");
}

describe("parseTelegramConfig", () => {
  it("parses a valid webhook configuration", () => {
    const config = parseTelegramConfig({
      ...webhookEnv,
      TELEGRAM_MINI_APP_URL: "https://app.example.test/mini",
      TELEGRAM_CRON_SECRET: CRON_SECRET,
    });

    expect(config).toEqual({
      token: TOKEN,
      webhookSecret: WEBHOOK_SECRET,
      botUsername: "steza_test_bot",
      mode: "webhook",
      environment: "development",
      miniAppUrl: "https://app.example.test/mini",
      cronSecret: CRON_SECRET,
    });
  });

  it("parses a valid polling configuration without a webhook secret", () => {
    const config = parseTelegramConfig(pollingEnv);

    expect(config.mode).toBe("polling");
    expect(config.webhookSecret).toBeUndefined();
    expect(config.apiRoot).toBeUndefined();
  });

  it("treats empty optional values as unset", () => {
    const config = parseTelegramConfig({
      ...pollingEnv,
      TELEGRAM_WEBHOOK_SECRET: "",
      TELEGRAM_API_ROOT: "",
      TELEGRAM_MINI_APP_URL: "",
      TELEGRAM_CRON_SECRET: "",
    });

    expect(config).not.toHaveProperty("webhookSecret");
    expect(config).not.toHaveProperty("apiRoot");
    expect(config).not.toHaveProperty("miniAppUrl");
    expect(config).not.toHaveProperty("cronSecret");
  });

  it("accepts a production configuration", () => {
    const config = parseTelegramConfig(productionEnv);

    expect(config.environment).toBe("production");
    expect(config.mode).toBe("webhook");
    expect(config.webhookSecret).toBe(WEBHOOK_SECRET);
  });

  it("reports a missing token", () => {
    const env = without(webhookEnv, "TELEGRAM_BOT_TOKEN");

    expect(problemsOf(env)).toEqual([
      expect.stringContaining("TELEGRAM_BOT_TOKEN is required"),
    ]);
  });

  it("reports a malformed token without echoing it", () => {
    const malformed = "not-a-token-shape";
    const problems = problemsOf({ ...webhookEnv, TELEGRAM_BOT_TOKEN: malformed });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("TELEGRAM_BOT_TOKEN");
    expect(problems.join("\n")).not.toContain(malformed);
  });

  it("requires a webhook secret in production", () => {
    const env = without(productionEnv, "TELEGRAM_WEBHOOK_SECRET");

    expect(problemsOf(env)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("TELEGRAM_WEBHOOK_SECRET is required"),
      ]),
    );
  });

  it("requires a webhook secret in webhook mode", () => {
    const env = without(webhookEnv, "TELEGRAM_WEBHOOK_SECRET");

    expect(problemsOf(env)).toEqual([
      expect.stringContaining("TELEGRAM_WEBHOOK_SECRET is required"),
    ]);
  });

  it("rejects polling mode in production", () => {
    const problems = problemsOf({ ...productionEnv, TELEGRAM_MODE: "polling" });

    expect(problems).toEqual([
      expect.stringContaining("production requires TELEGRAM_MODE=webhook"),
    ]);
  });

  it("requires a cron secret in production", () => {
    const env = without(productionEnv, "TELEGRAM_CRON_SECRET");

    expect(problemsOf(env)).toEqual([
      expect.stringContaining("TELEGRAM_CRON_SECRET is required"),
    ]);
  });

  it("rejects a short cron secret", () => {
    const problems = problemsOf({ ...webhookEnv, TELEGRAM_CRON_SECRET: "short" });

    expect(problems).toEqual([
      expect.stringContaining("TELEGRAM_CRON_SECRET must be at least 16"),
    ]);
  });

  it.each([
    ["leading whitespace", ` ${CRON_SECRET}`],
    ["trailing whitespace", `${CRON_SECRET} `],
  ])("rejects a cron secret with %s", (_label, value) => {
    expect(
      problemsOf({ ...webhookEnv, TELEGRAM_CRON_SECRET: value }),
    ).toEqual([
      expect.stringContaining(
        "TELEGRAM_CRON_SECRET must not have leading or trailing whitespace",
      ),
    ]);
  });

  it("rejects a cron secret with characters outside letters, digits, _ and -", () => {
    expect(
      problemsOf({
        ...webhookEnv,
        TELEGRAM_CRON_SECRET: "cron secret with spaces!",
      }),
    ).toEqual([expect.stringContaining("TELEGRAM_CRON_SECRET must be at least 16")]);
  });

  it("rejects a webhook secret equal to the bot token", () => {
    const problems = problemsOf({ ...webhookEnv, TELEGRAM_WEBHOOK_SECRET: TOKEN });

    expect(problems.join("\n")).toContain("must differ from TELEGRAM_BOT_TOKEN");
  });

  it("rejects a webhook secret with characters Telegram does not allow", () => {
    const problems = problemsOf({
      ...webhookEnv,
      TELEGRAM_WEBHOOK_SECRET: "has space!",
    });

    expect(problems).toEqual([
      expect.stringContaining("TELEGRAM_WEBHOOK_SECRET must be 1-256"),
    ]);
  });

  it.each([
    ["with a leading @", "@steza_test_bot"],
    ["not ending in bot", "steza_test_helper"],
    ["too short", "abot"],
    ["with invalid characters", "steza-test_bot"],
    ["too long", `${"a".repeat(30)}bot`],
  ])("rejects a bot username %s", (_label, username) => {
    expect(
      problemsOf({ ...webhookEnv, TELEGRAM_BOT_USERNAME: username }),
    ).toEqual([expect.stringContaining("TELEGRAM_BOT_USERNAME")]);
  });

  it("accepts a bot username ending in Bot with any letter case", () => {
    const config = parseTelegramConfig({
      ...webhookEnv,
      TELEGRAM_BOT_USERNAME: "StezaTestBot",
    });

    expect(config.botUsername).toBe("StezaTestBot");
  });

  describe("length boundaries", () => {
    const afterColon = (length: number) => `123456789:${"a".repeat(length)}`;

    it.each([
      [34, false],
      [35, true],
    ])("token with %i characters after the colon: valid=%s", (length, valid) => {
      const env = { ...webhookEnv, TELEGRAM_BOT_TOKEN: afterColon(length) };

      if (valid) {
        expect(parseTelegramConfig(env).token).toBe(afterColon(length));
      } else {
        expect(problemsOf(env)).toEqual([
          expect.stringContaining("TELEGRAM_BOT_TOKEN"),
        ]);
      }
    });

    it.each([
      [15, false],
      [16, true],
    ])("cron secret with %i characters: valid=%s", (length, valid) => {
      const env = { ...webhookEnv, TELEGRAM_CRON_SECRET: "c".repeat(length) };

      if (valid) {
        expect(parseTelegramConfig(env).cronSecret).toHaveLength(length);
      } else {
        expect(problemsOf(env)).toEqual([
          expect.stringContaining("TELEGRAM_CRON_SECRET"),
        ]);
      }
    });

    it.each([
      [256, true],
      [257, false],
    ])("webhook secret with %i characters: valid=%s", (length, valid) => {
      const env = { ...webhookEnv, TELEGRAM_WEBHOOK_SECRET: "w".repeat(length) };

      if (valid) {
        expect(parseTelegramConfig(env).webhookSecret).toHaveLength(length);
      } else {
        expect(problemsOf(env)).toEqual([
          expect.stringContaining("TELEGRAM_WEBHOOK_SECRET"),
        ]);
      }
    });

    it.each([
      [4, false],
      [5, true],
      [32, true],
      [33, false],
    ])("bot username with %i characters: valid=%s", (length, valid) => {
      const username = `${"a".repeat(length - 3)}bot`;
      const env = { ...webhookEnv, TELEGRAM_BOT_USERNAME: username };

      if (valid) {
        expect(parseTelegramConfig(env).botUsername).toBe(username);
      } else {
        expect(problemsOf(env)).toEqual([
          expect.stringContaining("TELEGRAM_BOT_USERNAME"),
        ]);
      }
    });
  });

  it("rejects an unknown mode and environment", () => {
    const problems = problemsOf({
      ...webhookEnv,
      TELEGRAM_MODE: "longpoll",
      TELEGRAM_ENV: "staging",
    });

    expect(problems).toEqual([
      expect.stringContaining("TELEGRAM_MODE must be one of"),
      expect.stringContaining("TELEGRAM_ENV must be one of"),
    ]);
  });

  it("requires mode and environment to be explicit", () => {
    const env = without(webhookEnv, "TELEGRAM_MODE", "TELEGRAM_ENV");

    expect(problemsOf(env)).toEqual([
      expect.stringContaining("TELEGRAM_MODE is required"),
      expect.stringContaining("TELEGRAM_ENV is required"),
    ]);
  });

  describe("apiRoot", () => {
    it("rejects http in production", () => {
      const problems = problemsOf({
        ...productionEnv,
        TELEGRAM_API_ROOT: "http://bot-api.example.test",
      });

      expect(problems).toEqual([
        expect.stringContaining("TELEGRAM_API_ROOT must use https in production"),
      ]);
    });

    it("allows http outside production", () => {
      const config = parseTelegramConfig({
        ...pollingEnv,
        TELEGRAM_API_ROOT: "http://bot-api.example.test:8081",
      });

      expect(config.apiRoot).toBe("http://bot-api.example.test:8081");
    });

    it.each([
      ["a trailing slash", "https://bot-api.example.test/", "https://bot-api.example.test"],
      ["several trailing slashes", "https://bot-api.example.test///", "https://bot-api.example.test"],
      ["a path with a trailing slash", "https://bot-api.example.test/proxy/", "https://bot-api.example.test/proxy"],
      ["a default port", "https://bot-api.example.test:443", "https://bot-api.example.test"],
      ["an uppercase host", "https://BOT-API.example.test", "https://bot-api.example.test"],
    ])("normalizes an api root with %s", (_label, value, expected) => {
      expect(
        parseTelegramConfig({ ...pollingEnv, TELEGRAM_API_ROOT: value }).apiRoot,
      ).toBe(expected);
    });

    it.each([
      ["leading whitespace", " https://bot-api.example.test"],
      ["trailing whitespace", "https://bot-api.example.test "],
    ])("rejects an api root with %s", (_label, value) => {
      expect(problemsOf({ ...pollingEnv, TELEGRAM_API_ROOT: value })).toEqual([
        expect.stringContaining(
          "TELEGRAM_API_ROOT must not have leading or trailing whitespace",
        ),
      ]);
    });

    it.each([
      ["userinfo", "https://user:pass@bot-api.example.test"],
      ["a username only", "https://user@bot-api.example.test"],
      ["a query string", "https://bot-api.example.test?x=1"],
      ["a fragment", "https://bot-api.example.test#frag"],
    ])("rejects an api root with %s", (_label, value) => {
      const problems = problemsOf({ ...pollingEnv, TELEGRAM_API_ROOT: value });

      expect(problems).toEqual([
        expect.stringContaining(
          "TELEGRAM_API_ROOT must not contain credentials, a query string or a fragment",
        ),
      ]);
      expect(problems.join("\n")).not.toContain("pass");
    });

    it("rejects values that are not http(s) URLs", () => {
      expect(
        problemsOf({ ...pollingEnv, TELEGRAM_API_ROOT: "ftp://example.test" }),
      ).toEqual([expect.stringContaining("TELEGRAM_API_ROOT must be")]);
      expect(
        problemsOf({ ...pollingEnv, TELEGRAM_API_ROOT: "not a url" }),
      ).toEqual([expect.stringContaining("TELEGRAM_API_ROOT must be")]);
    });
  });

  describe("test environment", () => {
    const testEnv = { ...pollingEnv, TELEGRAM_ENV: "test" };

    it("accepts the test environment without an api root", () => {
      expect(parseTelegramConfig(testEnv).environment).toBe("test");
    });

    it.each([
      "http://localhost:8081",
      "http://127.0.0.1:8081",
      "http://[::1]:8081",
    ])(
      "allows a local api root %s",
      (apiRoot) => {
        const config = parseTelegramConfig({
          ...testEnv,
          TELEGRAM_API_ROOT: apiRoot,
        });

        expect(config.apiRoot).toBe(apiRoot);
      },
    );

    it("rejects a non-local api root", () => {
      expect(
        problemsOf({
          ...testEnv,
          TELEGRAM_API_ROOT: "https://api.telegram.org",
        }),
      ).toEqual([
        expect.stringContaining("TELEGRAM_ENV=test requires TELEGRAM_API_ROOT"),
      ]);
    });
  });

  it("requires the mini app url to be https", () => {
    expect(
      problemsOf({
        ...webhookEnv,
        TELEGRAM_MINI_APP_URL: "http://app.example.test",
      }),
    ).toEqual([expect.stringContaining("TELEGRAM_MINI_APP_URL must be an https")]);
  });

  it.each([
    ["leading whitespace", " https://app.example.test"],
    ["trailing whitespace", "https://app.example.test "],
  ])("rejects a mini app url with %s", (_label, value) => {
    expect(
      problemsOf({ ...webhookEnv, TELEGRAM_MINI_APP_URL: value }),
    ).toEqual([
      expect.stringContaining(
        "TELEGRAM_MINI_APP_URL must not have leading or trailing whitespace",
      ),
    ]);
  });

  it("rejects a mini app url with credentials", () => {
    const problems = problemsOf({
      ...webhookEnv,
      TELEGRAM_MINI_APP_URL: "https://user:pass@app.example.test",
    });

    expect(problems).toEqual([
      expect.stringContaining("TELEGRAM_MINI_APP_URL must not contain credentials"),
    ]);
    expect(problems.join("\n")).not.toContain("pass");
  });

  it("collects every problem in one error", () => {
    const problems = problemsOf({
      ...productionEnv,
      TELEGRAM_BOT_TOKEN: undefined,
      TELEGRAM_BOT_USERNAME: "nope",
    });

    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("TELEGRAM_BOT_TOKEN");
    expect(problems.join("\n")).toContain("TELEGRAM_BOT_USERNAME");
  });

  it("lists all problems in the error message", () => {
    let caught: unknown;
    try {
      parseTelegramConfig({});
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TelegramConfigError);
    const error = caught as TelegramConfigError;
    expect(error.problems.length).toBeGreaterThanOrEqual(4);
    for (const problem of error.problems) {
      expect(error.message).toContain(problem);
    }
  });

  it("never includes secret values in the error message", () => {
    const secretEqualsToken = problemsOf({
      ...productionEnv,
      TELEGRAM_WEBHOOK_SECRET: TOKEN,
      TELEGRAM_CRON_SECRET: "short_cron",
      TELEGRAM_MODE: "polling",
    });
    const invalidValues = problemsOf({
      ...webhookEnv,
      TELEGRAM_BOT_TOKEN: "bad token value",
      TELEGRAM_WEBHOOK_SECRET: "bad secret value!",
      TELEGRAM_CRON_SECRET: "tiny",
    });
    const joined = [...secretEqualsToken, ...invalidValues].join("\n");

    for (const forbidden of [
      TOKEN,
      "123456789",
      "short_cron",
      "bad token value",
      "bad secret value!",
      "tiny",
    ]) {
      expect(joined).not.toContain(forbidden);
    }
  });

  it("narrows webhookSecret to a string in webhook mode", () => {
    const config = parseTelegramConfig(webhookEnv);

    if (config.mode === "webhook") {
      const secret: string = config.webhookSecret;
      expect(secret).toBe(WEBHOOK_SECRET);
    } else {
      throw new Error("Expected webhook mode");
    }
  });

  it("returns a frozen object", () => {
    const config = parseTelegramConfig(webhookEnv);

    expect(Object.isFrozen(config)).toBe(true);
    expect(() => {
      (config as { token: string }).token = "changed";
    }).toThrow(TypeError);
  });
});
