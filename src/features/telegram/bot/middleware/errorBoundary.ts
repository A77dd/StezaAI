import type { MiddlewareFn } from "grammy";
import { noticeForErrorCode } from "../../render";
import type { Notice } from "../../render";
import type { BotContext } from "../context";
import { UpdateProcessingError, describeError, errorCodeOf } from "../errors";
import { sendCard } from "../presenter";
import { classifyTelegramError } from "../telegramErrors";
import { updateKindOf } from "../updateFacts";
import { hasAnsweredCallback } from "./callbackAnswers";

/**
 * Update kinds where a failure notice makes sense: something a person just
 * sent or pressed. For the rest (membership changes, inline queries, ...)
 * there is no place to put a message, or nobody is waiting for one.
 */
const NOTICE_KINDS: ReadonlySet<string> = new Set(["message", "callback_query"]);

type NoticeDelivery = "answered_callback" | "sent_message" | "skipped_forbidden" | "skipped_kind" | "skipped_no_chat";

/**
 * Tells the user, once, that the action failed. A callback query is answered
 * with the notice (an alert, since the button they pressed did nothing); a
 * message gets a reply in the chat. The notice comes from the error CODE only
 * (`noticeForErrorCode`): never from a message, and never from a callback
 * `reason`, which would reveal that a button belongs to someone else.
 */
async function deliverNotice(ctx: BotContext, notice: Notice, error: unknown): Promise<NoticeDelivery> {
  // A 403 means the bot may not write here (blocked, kicked). Another send
  // would fail the same way and only bury the real error.
  if (classifyTelegramError(error) === "forbidden") return "skipped_forbidden";
  if (!NOTICE_KINDS.has(updateKindOf(ctx.update))) return "skipped_kind";
  if (ctx.callbackQuery !== undefined && !hasAnsweredCallback(ctx)) {
    await ctx.answerCallbackQuery({ text: notice.text, show_alert: true });
    return "answered_callback";
  }
  if (ctx.chat === undefined) return "skipped_no_chat";
  await sendCard(ctx, notice.message, { replyToInvoking: ctx.chat.type !== "private" });
  return "sent_message";
}

/**
 * The one place in the bot where errors are caught. Everything the handlers
 * and inner middleware throw ends here, and leaves as an
 * `UpdateProcessingError`: nothing is swallowed, the runtime still sees the
 * failure and decides whether to retry.
 *
 * For a failed update it (1) logs `update.failed` with a redacted description
 * of the error (class, code, Bot API status; never message text, payloads or
 * tokens), (2) sends the user one safe notice where that is possible, (3)
 * rethrows. If sending the notice fails too, that is logged
 * (`update.notice_failed`) and the ORIGINAL error is still the one rethrown:
 * a failure of the courtesy message must not hide the real failure.
 *
 * Blocked users: a 403 skips the notice (see `deliverNotice`). Recording that
 * the user blocked the bot (to stop reminders) is a job for the membership
 * handler (`my_chat_member`), not for this generic boundary.
 */
export function errorBoundary(): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      throw await reportFailure(ctx, error);
    }
  };
}

async function reportFailure(ctx: BotContext, error: unknown): Promise<UpdateProcessingError> {
  const description = describeError(error);
  ctx.log.error("update.failed", description);

  // No I/O here: the failure may be the settings store itself, and notices do
  // not need the user's timezone.
  const notice = noticeForErrorCode(errorCodeOf(error), ctx.viewContext(null));
  try {
    const delivery = await deliverNotice(ctx, notice, error);
    if (delivery.startsWith("skipped")) ctx.log.info("update.notice_skipped", { reason: delivery });
  } catch (noticeError) {
    ctx.log.error("update.notice_failed", describeError(noticeError));
  }

  return new UpdateProcessingError({
    updateId: ctx.update.update_id,
    causeCode: description.errorCode,
    cause: error,
  });
}
