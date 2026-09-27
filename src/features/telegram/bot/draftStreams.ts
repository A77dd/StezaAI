import type { Api } from "grammy";
import type { Logger } from "./logger";

/**
 * Streaming drafts (Bot API 9.3+, research §4.9, scenario I): while the bot
 * is generating an answer it can show a growing draft in the private chat,
 * with a Stop button. The draft is a 30-second preview and private-chats
 * only; the answer itself always lands as a normal card afterwards.
 *
 * Two pieces live here:
 * - `DraftStreamRegistry`: handler-owned state that survives the update, so
 *   `stopped_message_generation` (a separate update, from the same chat) can
 *   reach a stream that is still generating. It must run while the stream is
 *   live, which is why streaming handlers return early and generate in the
 *   background — `sequentialize` would otherwise delay the Stop press until
 *   after the generation finished.
 * - `createDraftStream`: the producer API. Chunks are flushed to Telegram at
 *   most once per throttle window (research assumption: 300-500 ms), with
 *   `can_stop` on and `keep_on_stop` off, so a pressed Stop removes the
 *   draft itself.
 */

export type ActiveDraftStream = {
  readonly draftId: number;
  /** Called once when the user presses the Stop button. */
  onStopped(): void;
};

export type DraftStreamRegistry = {
  /** Issues a nonzero `draft_id` (same id animates; a new id replaces it). */
  nextDraftId(): number;
  /** Adds a live stream to the registry, replacing any entry with the same id. */
  register(stream: ActiveDraftStream): void;
  /** Stops the stream with this id, if it is still live. */
  stop(draftId: number): boolean;
};

export type DraftStream = {
  readonly draftId: number;
  /** True once the user pressed Stop: the producer must stop generating. */
  readonly stopped: boolean;
  /** Sends the empty "Thinking…" draft. Call once, before the first push. */
  begin(): Promise<void>;
  /** Queues a chunk; the accumulated text is flushed within one throttle window. */
  push(chunk: string): void;
  /**
   * Waits `pacingMs` (the producer's generation pace), so a streaming loop
   * can `for (const chunk of chunks) await stream.pushPaced(chunk)` and the
   * Stop press is honored between chunks.
   */
  pushPaced(chunk: string): Promise<void>;
  /** Sends the final card through `sendFinal`; releases the draft id. */
  finish(sendFinal: () => Promise<void>): Promise<void>;
  /** Gives up the stream without a final card (already stopped, or failed). */
  release(): void;
};

export type DraftStreamDeps = {
  readonly api: Api;
  readonly registry: DraftStreamRegistry;
  readonly logger: Logger;
  readonly chatId: number;
  /** Default: 400 ms, the middle of the research assumption (300-500 ms). */
  readonly throttleMs?: number;
  /** Default: 700 ms, the demo's simulated generation pace. */
  readonly pacingMs?: number;
};

const DEFAULT_THROTTLE_MS = 400;
const DEFAULT_PACING_MS = 700;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createDraftStream(deps: DraftStreamDeps): DraftStream {
  const { api, registry, logger, chatId } = deps;
  const throttleMs = deps.throttleMs ?? DEFAULT_THROTTLE_MS;
  const pacingMs = deps.pacingMs ?? DEFAULT_PACING_MS;

  const draftId = registry.nextDraftId();

  let stopped = false;
  let released = false;
  let buffer = "";
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const sendDraft = async (text: string): Promise<void> => {
    try {
      // An empty text shows Telegram's "Thinking…" placeholder; `keep_on_stop`
      // is false, so a pressed Stop removes the draft on Telegram's side (and
      // the final message clears it anyway, per the API docs).
      await api.sendMessageDraft(chatId, draftId, text, { can_stop: true, keep_on_stop: false });
    } catch (error) {
      // A rejected draft must not kill the generation: the final card still
      // carries the whole answer. Logged, never silent.
      logger.warn("stream.draft_rejected", { draftId, method: "sendMessageDraft" });
      logger.warn("stream.draft_error", describe(error));
    }
  };

  const flush = async (): Promise<void> => {
    flushTimer = undefined;
    if (stopped || released) return;
    await sendDraft(buffer);
  };

  const scheduleFlush = (): void => {
    if (flushTimer !== undefined || stopped || released) return;
    flushTimer = setTimeout(() => void flush(), throttleMs);
  };

  const stream: DraftStream = {
    draftId,
    get stopped() {
      return stopped;
    },
    begin() {
      return sendDraft("");
    },
    push(chunk: string) {
      buffer += chunk;
      scheduleFlush();
    },
    async pushPaced(chunk: string) {
      stream.push(chunk);
      await sleep(pacingMs);
    },
    async finish(sendFinal) {
      if (flushTimer !== undefined) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
        // A pending chunk is content the user has not seen; flush it before
        // the final card replaces the draft.
        if (!stopped && !released && buffer !== "") await sendDraft(buffer);
      }
      await sendFinal();
      released = true;
    },
    release() {
      if (flushTimer !== undefined) clearTimeout(flushTimer);
      flushTimer = undefined;
      stopped = true;
      released = true;
    },
  };

  registry.register({
    draftId,
    onStopped() {
      stopped = true;
      if (flushTimer !== undefined) clearTimeout(flushTimer);
      flushTimer = undefined;
      logger.info("stream.stopped", { draftId });
    },
  });

  return stream;
}

function describe(error: unknown): { errorClass: string; errorCode?: string } {
  if (error instanceof Error) return { errorClass: error.constructor.name, errorCode: error.name };
  return { errorClass: typeof error };
}

/** In-memory registry (ADR 0003: handler-owned state, process lifetime). */
export function createDraftStreamRegistry(): DraftStreamRegistry {
  let lastId = 0;
  const streams = new Map<number, ActiveDraftStream>();

  return {
    nextDraftId() {
      lastId += 1;
      return lastId;
    },
    register(stream) {
      streams.set(stream.draftId, stream);
    },
    stop(draftId) {
      const stream = streams.get(draftId);
      if (stream === undefined) return false;
      streams.delete(draftId);
      stream.onStopped();
      return true;
    },
  };
}
