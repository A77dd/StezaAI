import { createInMemoryServices, createJsonLogger, describeError } from "@/features/telegram/bot";
import { parseTelegramConfig } from "@/features/telegram/config";
import { createTelegramBot } from "@/features/telegram/createTelegramBot";
import { startPolling } from "@/features/telegram/runtime/polling";

/**
 * The local long-polling runner (ADR 0003): `npm run dev:bot`.
 *
 * Configuration comes from the environment (`.env.local` is read by the
 * `dev:bot` script via Node's `--env-file-if-exists`). Everything the bot
 * keeps — callback tokens, drafts, reminders, dedupe — lives in memory and
 * resets when this process exits, so this runner is for hands-on
 * development, not production.
 */
async function main(): Promise<void> {
  const logger = createJsonLogger((line) => console.log(line));

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 22) {
    logger.error("bot.startup_failed", {
      errorCode: "unsupported_runtime",
      detail: `Node ${process.versions.node} is below the ADR 0003 baseline (22.23.3); run \`nvm use\` first (.nvmrc)`,
    });
    process.exit(1);
  }

  let config;
  try {
    config = parseTelegramConfig(process.env);
  } catch (error) {
    logger.error("bot.startup_failed", describeError(error));
    process.exit(1);
  }

  const services = createInMemoryServices({ config, logger });
  const bot = createTelegramBot({ services });

  const handle = await startPolling({ bot, config, logger });

  const stop = (signal: NodeJS.Signals): void => {
    logger.info("bot.signal", { signal });
    void handle.stop().then(() => process.exit(0));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

void main();
