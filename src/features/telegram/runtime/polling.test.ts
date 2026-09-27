import { describe, expect, it } from "vitest";
import { createPipelineHarness, TEST_BOT_TOKEN } from "@/features/telegram/testing/pipelineHarness";
import { parseTelegramConfig } from "@/features/telegram/config";
import { createMemoryLogger } from "@/features/telegram/bot";
import { startPolling } from "./polling";

function makeConfig(botUsername = "steza_test_bot"): ReturnType<typeof parseTelegramConfig> {
  return parseTelegramConfig({
    TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
    TELEGRAM_BOT_USERNAME: botUsername,
    TELEGRAM_MODE: "polling",
    TELEGRAM_ENV: "development",
  });
}

describe("startPolling", () => {
  it("starts with the configured identity, drops the webhook, and stops cleanly", async () => {
    const harness = createPipelineHarness();
    const logger = createMemoryLogger();

    const handle = await startPolling({
      bot: harness.bot,
      config: makeConfig(),
      logger,
      runnerOptions: { silent: true },
    });

    expect(harness.kit.fake.callsTo("deleteWebhook")).toHaveLength(1);
    expect(harness.kit.fake.callsTo("deleteWebhook")[0]?.payload.drop_pending_updates).toBe(true);
    expect(logger.records.some((r) => r.event === "bot.polling_started")).toBe(true);

    await handle.stop();
    expect(logger.records.some((r) => r.event === "bot.polling_stopped")).toBe(true);
  });

  it("refuses to run when the bot's identity differs from the configuration", async () => {
    const harness = createPipelineHarness({ kit: { botUsername: "some_other_bot" } });
    const logger = createMemoryLogger();

    await expect(
      startPolling({ bot: harness.bot, config: makeConfig(), logger }),
    ).rejects.toThrow(/some_other_bot/);

    // It failed before touching delivery: no webhook was deleted.
    expect(harness.kit.fake.callsTo("deleteWebhook")).toHaveLength(0);
  });
});
