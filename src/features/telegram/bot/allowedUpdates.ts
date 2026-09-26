import type { Update } from "grammy/types";

type UpdateKind = Exclude<keyof Update, "update_id">;

/**
 * The update kinds the bot asks Telegram for (`allowed_updates` of
 * `setWebhook` and `getUpdates`). Telegram's default leaves out some kinds and
 * sends everything else, so an explicit list keeps unhandled traffic away.
 * The rule (research 4.2): subscribe to a kind only when a handler exists for
 * it, otherwise the bot receives it and does nothing, or, worse, users see a
 * button acknowledged with no visible result.
 *
 * Handlers per kind (plan tasks): `message` (7, 8), `edited_message` (7),
 * `callback_query` (7), `inline_query` and `chosen_inline_result` (10),
 * `my_chat_member` (blocked/unblocked/added, 9), `guest_message` (10, Guest
 * Mode), `stopped_message_generation` (7, cancels a streamed answer).
 * Anything not listed here (`channel_post`, reactions, payments, boosts) is
 * deliberately not requested.
 */
export const ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "callback_query",
  "inline_query",
  "chosen_inline_result",
  "my_chat_member",
  "guest_message",
  "stopped_message_generation",
] as const satisfies readonly UpdateKind[];
