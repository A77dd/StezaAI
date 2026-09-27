import type { Composer } from "grammy";
import type { BotContext } from "../../bot";
import { sendCard, sendDocument } from "../../bot";
import { helpView, settingsView, welcomeView } from "../../render";
import type { HelpCommand } from "../../render";
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
    await sendCard(ctx, helpView({ availableCommands: AVAILABLE_COMMANDS }, viewCtx));
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
}
