import type { Composer } from "grammy";
import type { SourceRef } from "../../domain";
import type { BotContext } from "../../bot";
import { tryApplyPendingInput } from "./pendingInput";
import { submitMessage } from "./submitMessage";

function sourceOf(ctx: BotContext, text: string): SourceRef {
  const message = ctx.message;
  if (message === undefined) throw new Error("privateText: the update has no message");
  return {
    sourceType: "direct_message",
    sourceChatId: message.chat.id,
    sourceMessageId: message.message_id,
    relatedMessageIds: [],
    sourceText: text,
    sourceAuthor: null,
    sourceTimestamp: new Date(message.date * 1000).toISOString(),
    hiddenOrigin: false,
  };
}

/**
 * Private, non-command text: the entry point of the personal task scenario.
 * Order matters (spec: pending input reply > command > new task text):
 * commands are registered earlier on the same composer and already consumed
 * anything starting with a registered command, and a pending prompt (Task 7:
 * a timezone, a task edit, working hours) is checked here BEFORE the text is
 * ever handed to `submitText` as a new task.
 */
export function registerPrivateText(composer: Composer<BotContext>): void {
  composer.on("message:text", async (ctx, next) => {
    if (ctx.message.text.startsWith("/")) {
      // An unrecognized command: not this handler's concern, and never a task.
      await next();
      return;
    }
    if (ctx.from === undefined || ctx.chat === undefined) {
      await next();
      return;
    }
    const userId = String(ctx.from.id);
    const chatId = ctx.chat.id;
    const text = ctx.message.text;

    // A user can start by just typing, without `/start` first; every
    // personal-flow use-case requires settings to exist, so this guarantees
    // that (idempotently) before any of them run.
    await ctx.services.personalFlow.startUser({ userId, locale: ctx.locale });

    if (await tryApplyPendingInput(ctx, userId, chatId, text)) return;

    await submitMessage(ctx, { text, source: sourceOf(ctx, text), dateTimeHints: [] });
  });
}
