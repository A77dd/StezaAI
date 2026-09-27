import { Composer } from "grammy";
import type { BotContext } from "@/features/telegram/bot";
import type { SourceRef } from "@/features/telegram/domain";
import { answerCallback, editCard, ownerOf, sendCard, targetOfCallback } from "@/features/telegram/bot";
import { groupChooserView } from "@/features/telegram/render";
import { saveDraft } from "@/features/telegram/domain/useCases/shared";
import { peekCallbackAction } from "@/features/telegram/handlers/personal/callbackRouting";
import { isBotMentioned, isReplyToBot } from "@/features/telegram/handlers/mentionDetection";

/**
 * Group flow (ADR 0002 Task 9): privacy mode ON, responds only to:
 * - @mention of bot username
 * - reply to bot's own message
 * - bot command addressed to bot
 * Shows group chooser, then personal/team/remember paths.
 */
export function registerGroupFlow(): Composer<BotContext> {
  const group = new Composer<BotContext>();
  const scoped = group.filter((ctx): ctx is BotContext => ctx.chatContext === "CHAT");

  // Trigger handlers for messages that address the bot
  scoped.on("message:text", async (ctx, next) => {
    if (!isBotMentioned(ctx) && !isReplyToBot(ctx)) {
      await next();
      return;
    }
    await handleGroupMessage(ctx);
  });

  // Callback handlers for context.choose (personal/group/remember)
  scoped.on("callback_query:data", async (ctx, next) => {
    if (peekCallbackAction(ctx.callbackQuery.data) !== "context.choose") {
      await next();
      return;
    }
    await handleContextChoose(ctx, ctx.callbackQuery.data);
  });

  return group;
}

function sourceOf(ctx: BotContext, text: string): SourceRef {
  const message = ctx.message;
  if (message === undefined) throw new Error("groupSource: the update has no message");
  return {
    sourceType: "group_message",
    sourceChatId: message.chat.id,
    sourceMessageId: message.message_id,
    relatedMessageIds: [],
    sourceText: text,
    sourceAuthor: message.from?.username ?? null,
    sourceTimestamp: new Date(message.date * 1000).toISOString(),
    hiddenOrigin: false,
  };
}

async function handleGroupMessage(ctx: BotContext): Promise<void> {
  if (ctx.from === undefined || ctx.chat === undefined) return;

  const message = ctx.message;
  const text = message?.text;
  if (message === undefined || text === undefined) return;

  // For now, just show the group chooser
  // TODO: parse intent from text, extract title
  const draft = await saveDraft(ctx.services, {
    userId: String(ctx.from.id),
    chatId: ctx.chat.id,
    intent: null,
    source: sourceOf(ctx, text),
    kind: "group_choice",
  });

  const viewCtx = ctx.viewContext(await ctx.loadSettings());
  await sendCard(ctx, groupChooserView({ draftId: draft.id, title: text.slice(0, 120) }, viewCtx));
}

async function handleContextChoose(ctx: BotContext, data: string): Promise<void> {
  await answerCallback(ctx);

  const owner = ownerOf(ctx);
  const resolved = await ctx.services.callbacks.resolve(data, owner);
  if (resolved.action !== "context.choose") throw new Error("context.choose handler resolved a different action");

  const { draftId, choice } = resolved.payload;
  const target = targetOfCallback(ctx);
  const viewCtx = ctx.viewContext(await ctx.loadSettings());

  const draft = await ctx.services.drafts.get(owner.userId, draftId);
  if (draft === null) {
    const notice = viewCtx.catalog.notices.expired;
    await editCard(ctx, target, { kind: "text", text: notice, parseMode: "HTML", linkPreview: "disabled", keyboard: null });
    return;
  }

  switch (choice) {
    case "remember": {
      await editCard(ctx, target, { kind: "text", text: viewCtx.catalog.group.rememberNote, parseMode: "HTML", linkPreview: "disabled", keyboard: null });
      break;
    }
    case "personal": {
      // In group: edit the card to a pointer, without any calendar detail
      // (the proposal itself is built in the private chat; Task 9).
      await editCard(ctx, target, { kind: "text", text: viewCtx.catalog.group.pointer, parseMode: "HTML", linkPreview: "disabled", keyboard: null });
      break;
    }
    case "group": {
      // Team scheduling is not built yet (Task 9).
      await editCard(ctx, target, { kind: "text", text: viewCtx.catalog.group.teamPending, parseMode: "HTML", linkPreview: "disabled", keyboard: null });
      break;
    }
  }
}
