import type { Api } from "grammy";
import type { Logger } from "./logger";

/**
 * Streaming an answer while it is generated (research §4.9, scenario I), with
 * two transports for the same producer-facing surface:
 *
 * - `createDraftStream` — Bot API 9.3+ drafts: a growing draft in the private
 *   chat, with a Stop button. The draft is a 30-second preview and
 *   private-chats only; the answer itself always lands as a normal card
 *   afterwards.
 * - `createEditStream` — the edit-based fallback (verdict: USE NOW) for
 *   groups and anywhere drafts do not exist: one message is sent immediately
 *   as the "thinking" placeholder and then `editMessageText` replaces its
 *   text at most once per second (the long-standing ~1 update/second per
 *   chat guidance), ending with a final edit that swaps in the complete card.
 *
 * Two pieces live here:
 * - `DraftStreamRegistry`: handler-owned state that survives the update, so
 *   `stopped_message_generation` (a separate update, from the same chat) can
 *   reach a stream that is still generating. It must run while the stream is
 *   live, which is why streaming handlers return early and generate in the
 *   background — `sequentialize` would otherwise delay the Stop press until
 *   after the generation finished.
 * - the two stream factories. Chunks are flushed to Telegram at most once
 *   per throttle window (research assumption: 300-500 ms for drafts), with
 *   `can_stop` on and `keep_on_stop` off, so a pressed Stop removes the
 *   draft itself. Groups have no Stop mechanism; the edit stream simply
 *   cannot be interrupted by the reader.
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

const DEFAULT_EDIT_THROTTLE_MS = 1000;

export type EditStream = {
  /** Always false: Telegram offers no Stop mechanism for edited messages. */
  readonly stopped: boolean;
  /** Sends the "thinking" placeholder message and remembers its id. */
  begin(): Promise<void>;
  /** Queues a chunk; the message text is edited at most once per throttle window. */
  push(chunk: string): void;
  /** Waits `pacingMs`, so a streaming loop can pace its chunks. */
  pushPaced(chunk: string): Promise<void>;
  /**
   * Edits the progressive message one last time, swapping in the complete
   * card (`finalHtml` is Telegram HTML, as produced by `renderMessage`).
   */
  finish(finalHtml: string): Promise<void>;
  /** Gives up the stream without a final edit (already finished, or failed). */
  release(): void;
};

export type EditStreamDeps = {
  readonly api: Api;
  readonly logger: Logger;
  readonly chatId: number;
  /** The forum topic of the invoking message, so the stream stays in it. */
  readonly threadId?: number;
  /** The first text the progressive message carries ("Думаю…"). */
  readonly thinkingText: string;
  /** Default: 1000 ms — the research guidance is at most one edit per second. */
  readonly throttleMs?: number;
  readonly pacingMs?: number;
};

/**
 * The edit-based streaming fallback for chats where drafts do not exist
 * (groups, topics). Same pacing surface as `createDraftStream`, but the
 * progress lives in one ordinary message: `begin` sends the placeholder,
 * pushes edit its text, `finish` replaces it with the complete card.
 */
export function createEditStream(deps: EditStreamDeps): EditStream {
  const { api, logger, chatId, threadId, thinkingText } = deps;
  const throttleMs = deps.throttleMs ?? DEFAULT_EDIT_THROTTLE_MS;
  const pacingMs = deps.pacingMs ?? DEFAULT_PACING_MS;

  let messageId: number | undefined;
  let lastSent = thinkingText;
  let buffer = "";
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;

  const editProgress = async (text: string): Promise<void> => {
    if (messageId === undefined || text === lastSent) return;
    try {
      await api.editMessageText(chatId, messageId, text);
      lastSent = text;
    } catch (error) {
      // "message is not modified" or a rate limit must not kill generation:
      // the final edit still carries the whole answer. Logged, never silent.
      logger.warn("stream.edit_rejected", describe(error));
    }
  };

  const flush = async (): Promise<void> => {
    flushTimer = undefined;
    if (finished) return;
    await editProgress(buffer);
  };

  const scheduleFlush = (): void => {
    if (flushTimer !== undefined || finished) return;
    flushTimer = setTimeout(() => void flush(), throttleMs);
  };

  return {
    get stopped() {
      return false;
    },
    async begin() {
      const message = await api.sendMessage(chatId, thinkingText, {
        ...(threadId === undefined ? {} : { message_thread_id: threadId }),
      });
      messageId = message.message_id;
      lastSent = thinkingText;
    },
    push(chunk: string) {
      buffer += chunk;
      scheduleFlush();
    },
    async pushPaced(chunk: string) {
      this.push(chunk);
      await sleep(pacingMs);
    },
    async finish(finalHtml: string) {
      if (flushTimer !== undefined) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
      }
      if (messageId !== undefined) {
        try {
          await api.editMessageText(chatId, messageId, finalHtml, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
        } catch (error) {
          logger.warn("stream.edit_rejected", describe(error));
        }
      }
      finished = true;
    },
    release() {
      if (flushTimer !== undefined) clearTimeout(flushTimer);
      flushTimer = undefined;
      finished = true;
    },
  };
}
