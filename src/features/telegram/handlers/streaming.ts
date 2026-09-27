import { Composer } from "grammy";
import type { BotContext } from "../bot";

/**
 * The receiver of the draft Stop button (Bot API 10.3): when the user presses
 * "Стоп" on a streaming draft, Telegram sends a `stopped_message_generation`
 * update carrying the `draft_id`. The handler only marks the matching stream
 * stopped through the registry; the generating producer (today the `/demo`
 * simulation, later the LLM adapter) observes the flag between chunks and
 * gives up on its own, so cancellation stays cooperative and single-threaded.
 *
 * This update must be handled even while a stream is generating, which is why
 * streaming handlers return early and generate in the background:
 * `sequentialize` would otherwise hold this update back until the generation
 * had already finished.
 */
export function registerStreaming(): Composer<BotContext> {
  const streaming = new Composer<BotContext>();
  streaming.on("stopped_message_generation", async (ctx) => {
    const { draft_id: draftId } = ctx.update.stopped_message_generation;
    const found = ctx.services.draftStreams.stop(draftId);
    if (!found) {
      // An unknown or already-released id: nothing to cancel, and the draft
      // is gone or expired on Telegram's side either way.
      ctx.log.debug("stream.stop_ignored", { draftId });
    }
  });
  return streaming;
}
