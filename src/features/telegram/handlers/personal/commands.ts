import type { Composer } from "grammy";
import type { BotContext } from "../../bot";
import { createDraftStream, describeError, sendCard, sendDocument } from "../../bot";
import type { DraftStreamDeps } from "../../bot";
import { demoDoneView, helpRichView, helpView, settingsView, welcomeView } from "../../render";
import type { HelpCommand, ViewContext } from "../../render";
import { renderDeleteConfirmation } from "./dataCallbacks";

/** Commands implemented by this task; `/help` must never advertise more than this. */
const AVAILABLE_COMMANDS: readonly HelpCommand[] = ["start", "help", "settings", "export", "deleteme"];

const EXPORT_FILE_NAME = "steza-export.json";

function userIdOf(ctx: BotContext): string {
  // Every command handler here runs on a `message` update with a `from`
  // (grammY guarantees this for `.command`); a missing one is a bug upstream.
  if (ctx.from === undefined) throw new Error("command handler: the update has no user");
  return String(ctx.from.id);
}

/**
 * `/demo` (scenario I): simulates a streaming LLM answer with drafts, so the
 * mechanics — gradual text, the Stop button, the final card — can be exercised
 * on a real device before any model is connected. Not advertised in `/help`.
 * `streamOptions` exists for tests; production uses the defaults.
 */
export async function runDemoStream(
  ctx: BotContext,
  viewCtx: ViewContext,
  streamOptions: Partial<Pick<DraftStreamDeps, "throttleMs" | "pacingMs">> = {},
): Promise<void> {
  if (ctx.chat === undefined || ctx.chat.type !== "private") {
    throw new Error("demo stream: drafts exist only in private chats");
  }
  const stream = createDraftStream({
    api: ctx.api,
    registry: ctx.services.draftStreams,
    logger: ctx.services.logger,
    chatId: ctx.chat.id,
    ...streamOptions,
  });
  ctx.log.info("stream.started", { draftId: stream.draftId });
  try {
    await stream.begin();
    for (const paragraph of viewCtx.catalog.demo.paragraphs) {
      if (stream.stopped) return; // the Stop press already removed the draft
      await stream.pushPaced(paragraph + "\n\n");
    }
    await stream.finish(async () => {
      await sendCard(ctx, demoDoneView(viewCtx));
    });
    ctx.log.info("stream.finished", { draftId: stream.draftId });
  } catch (error) {
    stream.release();
    throw error;
  }
}

/** `/start`, `/help`, `/settings`, `/export`, `/deleteme` (Task 7: scenario A). */
export function registerCommands(composer: Composer<BotContext>): void {
  composer.command("start", async (ctx) => {
    const userId = userIdOf(ctx);
    const { settings } = await ctx.services.personalFlow.startUser({ userId, locale: ctx.locale });
    const viewCtx = ctx.viewContext(settings);
    await sendCard(
      ctx,
      welcomeView({ firstName: ctx.from?.first_name ?? null, calendarConnected: settings.calendarConnected }, viewCtx),
    );
  });

  composer.command("help", async (ctx) => {
    const viewCtx = ctx.viewContext(await ctx.loadSettings());
    // Rich pilot (research §5.2): long structured content goes out as a Rich
    // Message; if the Bot API or the client rejects it, the HTML card is the
    // fallback. Nothing has been sent when the fallback kicks in.
    try {
      await sendCard(ctx, helpRichView({ availableCommands: AVAILABLE_COMMANDS }, viewCtx));
    } catch (error) {
      ctx.log.warn("help.rich_fallback", describeError(error));
      await sendCard(ctx, helpView({ availableCommands: AVAILABLE_COMMANDS }, viewCtx));
    }
  });

  composer.command("settings", async (ctx) => {
    const userId = userIdOf(ctx);
    const { settings } = await ctx.services.personalFlow.startUser({ userId, locale: ctx.locale });
    const viewCtx = ctx.viewContext(settings);
    await sendCard(ctx, settingsView(settings, viewCtx));
  });

  composer.command("export", async (ctx) => {
    const userId = userIdOf(ctx);
    const data = await ctx.services.personalFlow.exportUserData({ userId });
    const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2));
    await sendDocument(ctx, EXPORT_FILE_NAME, bytes);
  });

  composer.command("deleteme", async (ctx) => {
    const viewCtx = ctx.viewContext(await ctx.loadSettings());
    await sendCard(ctx, renderDeleteConfirmation(viewCtx));
  });

  composer.command("demo", (ctx) => {
    if (ctx.chat?.type !== "private") return;
    const started = (async () => ctx.viewContext(await ctx.loadSettings()))();
    // Returns before generating: the chat queue must stay free so the
    // `stopped_message_generation` update is not held back by `sequentialize`.
    void started
      .then((viewCtx) => runDemoStream(ctx, viewCtx))
      .catch((error: unknown) => {
        ctx.log.error("stream.failed", describeError(error));
      });
  });
}
