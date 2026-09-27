import type { Composer } from "grammy";
import { addMinutes, PENDING_INPUT_TTL_MINUTES } from "../../domain";
import type { BotContext } from "../../bot";
import { answerCallback, editCard, ownerOf, sendCard, targetOfCallback } from "../../bot";
import { askInputView, CALENDAR_CONNECT, fill, renderMessage, settingsView, text } from "../../render";
import type { ViewContext } from "../../render";
import { peekCallbackAction } from "./callbackRouting";
import { sendSubmitOutcome } from "./outcomes";

/** `refId` is unused for the `working_hours` purpose (see `PendingInput`); this documents that explicitly. */
const NO_REF_ID = "-";

/** `settings.toggle` (notification intensity, block length, working hours, calendar) and `settings.timezone`. */
export function registerSettingsCallbacks(composer: Composer<BotContext>): void {
  composer.on("callback_query:data", async (ctx, next) => {
    if (peekCallbackAction(ctx.callbackQuery.data) !== "settings.toggle") {
      await next();
      return;
    }
    await handleSettingsToggle(ctx, ctx.callbackQuery.data);
  });

  composer.on("callback_query:data", async (ctx, next) => {
    if (peekCallbackAction(ctx.callbackQuery.data) !== "settings.timezone") {
      await next();
      return;
    }
    await handleSettingsTimezone(ctx, ctx.callbackQuery.data);
  });
}

async function askWorkingHours(
  ctx: BotContext,
  userId: string,
  chatId: number,
  cardMessageId: number | undefined,
): Promise<void> {
  const viewCtx = ctx.viewContext(await ctx.loadSettings());
  const prompt = await sendCard(ctx, askInputView({ kind: "working_hours" }, viewCtx));
  await ctx.services.pendingInputs.save({
    userId,
    chatId,
    promptMessageId: prompt.message_id,
    purpose: "working_hours",
    refId: NO_REF_ID,
    expiresAt: addMinutes(ctx.services.clock.now(), PENDING_INPUT_TTL_MINUTES),
  });
  ctx.services.promptTracker.remember(userId, chatId, {
    promptMessageId: prompt.message_id,
    purpose: "working_hours",
    cardMessageId,
  });
}

async function handleSettingsToggle(ctx: BotContext, data: string): Promise<void> {
  // Answer immediately for idempotency
  await answerCallback(ctx);

  const owner = ownerOf(ctx);
  const resolved = await ctx.services.callbacks.resolve(data, owner);
  if (resolved.action !== "settings.toggle") throw new Error("settings.toggle handler resolved a different action");
  const target = targetOfCallback(ctx);
  const { key, value } = resolved.payload;

  if (key === "working_hours") {
    const chatId = target.kind === "chat" ? target.chatId : owner.chatId;
    await askWorkingHours(ctx, owner.userId, chatId, target.kind === "chat" ? target.messageId : undefined);
    return;
  }

  const viewCtx: ViewContext = ctx.viewContext(await ctx.loadSettings());
  const { personalFlow } = ctx.services;
  const settings =
    key === "notification_intensity"
      ? await personalFlow.setNotificationIntensity({ userId: owner.userId, intensity: value ?? "" })
      : key === "block_length"
        ? await personalFlow.setBlockLength({ userId: owner.userId, minutes: Number(value) })
        : await personalFlow.setCalendarConnected({ userId: owner.userId, connected: value === CALENDAR_CONNECT });

  await editCard(ctx, target, settingsView(settings, viewCtx));
}

async function handleSettingsTimezone(ctx: BotContext, data: string): Promise<void> {
  // Answer immediately for idempotency
  await answerCallback(ctx);

  const owner = ownerOf(ctx);
  const resolved = await ctx.services.callbacks.resolve(data, owner);
  if (resolved.action !== "settings.timezone") throw new Error("settings.timezone handler resolved a different action");
  const target = targetOfCallback(ctx);
  const viewCtx: ViewContext = ctx.viewContext(await ctx.loadSettings());

  // The timezone presets live on the SAME message `PendingInputRepository` was
  // given as the prompt for a `timezone`-purpose pending input (both the
  // preset buttons and a free-text reply answer the one prompt), so the
  // button's own message id is the key to look it up.
  const pending =
    target.kind === "chat"
      ? await ctx.services.pendingInputs.peekByPrompt(owner.userId, target.chatId, target.messageId)
      : null;
  const draftId = pending !== null && pending.purpose === "timezone" ? pending.refId : undefined;

  const result = await ctx.services.personalFlow.setTimezone({ userId: owner.userId, tz: resolved.payload.tz, draftId });
  if (pending?.purpose === "timezone" && target.kind === "chat") {
    await ctx.services.pendingInputs.consumeByPrompt(owner.userId, target.chatId, target.messageId);
    ctx.services.promptTracker.consume(owner.userId, target.chatId);
  }

  if (result.kind === "timezone_set") {
    const confirmation = fill(viewCtx.catalog.personal.timezoneConfirmed, { tz: text(result.settings.timezone) });
    await editCard(ctx, target, renderMessage({ body: confirmation }));
    return;
  }

  await sendSubmitOutcome(ctx, owner.userId, result, viewCtx);
}
