import type { BotContext } from "../bot";

/** Checks if the message mentions the bot by username (@botname). */
export function isBotMentioned(ctx: BotContext): boolean {
  const message = ctx.message;
  const entities = message?.entities;
  if (message === undefined || entities === undefined || entities.length === 0) return false;
  const botUsername = ctx.services.config.botUsername.toLowerCase();
  for (const entity of entities) {
    if (entity.type === "mention") {
      const mentionText = message.text?.slice(entity.offset, entity.offset + entity.length).toLowerCase();
      if (mentionText === `@${botUsername}`) return true;
    }
    // `text_mention.user` is the full User object, so identity is the id, not
    // the username (Telegram Bot API: text_mention is for users without one;
    // ADR 0002 research: `text_mention.user.id == bot.id`).
    if (entity.type === "text_mention" && entity.user?.id === ctx.me.id) {
      return true;
    }
  }
  return false;
}

/** Checks if the message is a reply to a message sent by the bot. */
export function isReplyToBot(ctx: BotContext): boolean {
  const reply = ctx.message?.reply_to_message;
  if (reply === undefined) return false;
  const botId = ctx.me.id;
  return reply.from?.id === botId;
}