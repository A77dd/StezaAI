import { createInMemoryServices, createJsonLogger, describeError } from "@/features/telegram/bot";
import { createTelegramBot } from "@/features/telegram/createTelegramBot";
import { parseTelegramConfig } from "@/features/telegram/config";
import { createWebhookHandler } from "@/features/telegram/runtime/webhook";

/**
 * The thin webhook route (ADR 0002, Task 12 minimum). It only verifies the
 * shape of the request and hands the update to the bot pipeline; all policy
 * lives in `runtime/webhook.ts` (tested there) and the pipeline itself.
 *
 * Minimum runtime caveat (ADR 0003): the bot's adapters are in memory, so
 * callback tokens, drafts and dedupe state live only for the lifetime of this
 * process. The route therefore expects a single long-lived process, not a
 * serverless host; durable storage and a drain worker are deferred.
 */

export const dynamic = "force-dynamic";

type WebhookRuntime = {
  readonly handle: (request: Request) => Promise<Response>;
};

let runtime: Promise<WebhookRuntime> | undefined;

function startRuntime(): Promise<WebhookRuntime> {
  return (async () => {
    const logger = createJsonLogger((line) => console.log(line));
    const config = parseTelegramConfig(process.env);
    if (config.mode !== "webhook") {
      throw new Error("the webhook route requires TELEGRAM_MODE=webhook; use the polling runner locally");
    }
    const services = createInMemoryServices({ config, logger });
    const bot = createTelegramBot({ services });
    if (bot.botInfo === undefined) await bot.init();
    return {
      handle: createWebhookHandler({
        logger,
        secret: config.webhookSecret,
        handleUpdate: (update) => bot.handleUpdate(update),
      }),
    };
  })();
}

async function getRuntime(): Promise<WebhookRuntime | undefined> {
  if (runtime === undefined) {
    // Only a successful start is cached: a transient getMe failure retries on
    // the next delivery, and a config error is re-reported per request.
    runtime = startRuntime().catch((error) => {
      runtime = undefined;
      throw error;
    });
  }
  try {
    return await runtime;
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "webhook.startup_failed", ...describeError(error) }));
    return undefined;
  }
}

export async function POST(request: Request): Promise<Response> {
  const started = await getRuntime();
  if (started === undefined) return new Response("telegram webhook is not configured", { status: 503 });
  return started.handle(request);
}
