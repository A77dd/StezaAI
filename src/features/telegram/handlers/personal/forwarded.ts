import type { Composer } from "grammy";
import type { BotContext } from "../../bot";
import { extractForwardedMessage } from "../forwardExtractor";
import { createMediaGroupBuffer } from "../mediaGroupBuffer";
import type { MediaGroupBuffer } from "../mediaGroupBuffer";
import { submitMessage } from "./submitMessage";

/** Forward mapping is confined to the transport boundary. */
export function registerForwarded(composer: Composer<BotContext>): void {
  const contexts = new Map<string, BotContext>();
  let buffer: MediaGroupBuffer | undefined;

  composer.on("message", async (ctx, next) => {
    const extracted = extractForwardedMessage(ctx.message);
    if (extracted === null || ctx.from === undefined || ctx.chat === undefined) {
      await next();
      return;
    }
    const mediaGroupId = ctx.message.media_group_id;
    if (mediaGroupId === undefined) {
      if (extracted.text.trim() !== "") await submitMessage(ctx, extracted);
      return;
    }

    const key = JSON.stringify([ctx.chat.id, mediaGroupId]);
    contexts.set(key, ctx);
    buffer ??= createMediaGroupBuffer({
      timers: { setTimeout, clearTimeout },
      onFlush: async (item, group) => {
        const flushedKey = JSON.stringify([group.chatId, group.mediaGroupId]);
        const firstContext = contexts.get(flushedKey);
        if (firstContext === undefined) throw new Error("Album context is missing");
        contexts.delete(flushedKey);
        await submitMessage(firstContext, item);
      },
      onError: () => ctx.services.logger.error("album.flush_failed"),
    });
    await buffer.add({ chatId: ctx.chat.id, mediaGroupId, message: extracted });
  });
}
