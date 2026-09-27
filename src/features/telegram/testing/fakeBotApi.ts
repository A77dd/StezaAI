import { HttpError, InputFile } from "grammy";
import type { Transformer } from "grammy";
import type { ApiResponse, Update } from "grammy/types";
import { createFixedClock } from "../adapters/fixedClock";
import type { Clock } from "../domain";
import { DEFAULT_TEST_START } from "./testClock";
import { createFaultQueue, failureBody, isNetworkFailure } from "./state/faultQueue";
import type { FakeFailure } from "./state/faultQueue";
import { createFakeState } from "./state/fakeState";
import { observeUpdate } from "./state/observe";
import { DEFAULT_RATE_LIMITS } from "./state/rateLimiter";
import type { RateLimitOptions } from "./state/rateLimiter";
import { createMessageIdAllocator } from "./messageIds";
import { METHOD_HANDLERS } from "./methods";
import { fakeBotInfo } from "./participants";
import type { CallOutcome, FakeBotApiOptions, RecordedCall } from "./fakeTypes";
import { ApiRejection } from "./validation/rejection";
import { isRecord } from "./validation/guards";
import type { Payload } from "./validation/guards";

export type { FakeBotApiOptions, RecordedCall, CallOutcome } from "./fakeTypes";
export type { FakeFailure } from "./state/faultQueue";
export { fakeFailures } from "./state/faultQueue";
export type { RateLimitOptions } from "./state/rateLimiter";

const DEFAULT_USERNAME = "steza_test_bot";

function rateLimitSettings(option: FakeBotApiOptions["rateLimits"]): RateLimitOptions | undefined {
  if (option === undefined || option === false) return undefined;
  return option === true ? DEFAULT_RATE_LIMITS : { ...DEFAULT_RATE_LIMITS, ...option };
}

/** The request body as it would be sent: JSON data, `undefined` dropped; uploads stay as they are. */
function toWire(raw: unknown): Payload {
  if (!isRecord(raw)) throw new Error("fake Bot API: the payload of a call must be an object");
  const wire: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    wire[key] = value instanceof InputFile ? value : (JSON.parse(JSON.stringify(value)) as unknown);
  }
  return wire;
}

/**
 * grammY expects a typed result per method; the fake answers in one place for
 * every method, so the result type is erased here and only here.
 */
function success(result: unknown): ApiResponse<never> {
  return { ok: true, result: result as never };
}

function networkError(method: string, message: string): HttpError {
  return new HttpError(`Network request for '${method}' failed!`, new Error(message));
}

/**
 * A fake Telegram Bot API for tests: install `transformer` with
 * `bot.api.config.use(fake.transformer)` and no request leaves the process.
 *
 * It keeps state (messages per chat with incrementing ids, pending callback
 * queries, files, drafts, blocked chats), validates every payload the way the
 * real API does and answers rejected calls with `{ ok: false, ... }` so
 * grammY throws a real `GrammyError`. Failures can be queued with
 * `failNext`; flood control is opt-in. Nothing reads the real clock.
 *
 * The transformer is terminal, so install it BEFORE plugin transformers such
 * as auto-retry or the throttler: transformers installed later wrap it, ones
 * installed earlier would be bypassed. `TelegramTestKit.attach` enforces this.
 */
export function createFakeBotApi(options: FakeBotApiOptions = {}) {
  const clock = { current: options.clock ?? createFixedClock(DEFAULT_TEST_START) };
  const state = createFakeState({
    clock,
    botInfo: options.botInfo ?? fakeBotInfo(DEFAULT_USERNAME),
    messageIds: options.messageIds ?? createMessageIdAllocator(),
    rateLimits: rateLimitSettings(options.rateLimits),
  });
  const faults = createFaultQueue();
  const recorded: RecordedCall[] = [];

  // If failRichMessages is true, queue a permanent failure for sendRichMessage
  // so tests fall back to the HTML card path.
  if (options.failRichMessages) {
    faults.add("sendRichMessage", { error_code: 400, description: "Rich messages disabled in test mode" }, 1000000);
  }

  const record = (method: string, payload: Payload, outcome: CallOutcome): void => {
    recorded.push({ seq: recorded.length + 1, method, payload, at: clock.current.now(), outcome });
  };

  const transformer: Transformer = async (_prev, method, rawPayload) => {
    const handler = METHOD_HANDLERS[method];
    if (handler === undefined) {
      throw new Error(`fake Bot API: ${method} is not implemented; add a handler in testing/methods`);
    }
    const payload = toWire(rawPayload);
    const failure = faults.take(method);

    if (failure !== undefined && !isNetworkFailure(failure)) {
      const body = failureBody(failure);
      record(method, payload, { kind: "error", ...body });
      return { ok: false, ...body };
    }
    if (failure !== undefined && failure.deliver !== true) {
      record(method, payload, { kind: "network_error", message: failure.network_error, delivered: false });
      throw networkError(method, failure.network_error);
    }

    let response: ApiResponse<never>;
    let outcome: CallOutcome;
    try {
      const result: unknown = await handler({ state }, payload);
      response = success(result);
      outcome = { kind: "ok", result };
    } catch (error) {
      if (!(error instanceof ApiRejection)) throw error;
      const body = {
        error_code: error.errorCode,
        description: error.description,
        ...(error.parameters === undefined ? {} : { parameters: error.parameters }),
      };
      response = { ok: false, ...body };
      outcome = { kind: "error", ...body };
    }

    if (failure !== undefined) {
      // Delivered, but the response was lost: state has changed, the caller sees an error.
      record(method, payload, { kind: "network_error", message: failure.network_error, delivered: true });
      throw networkError(method, failure.network_error);
    }
    record(method, payload, outcome);
    return response;
  };

  return {
    /** Install with `bot.api.config.use(fake.transformer)`. It never calls the next transformer. */
    transformer,
    /** Every call received so far, oldest first. */
    get calls(): readonly RecordedCall[] {
      return recorded;
    },
    callsTo(method: string): readonly RecordedCall[] {
      return recorded.filter((call) => call.method === method);
    },
    /** The latest call, or the latest call to `method`. */
    lastCall(method?: string): RecordedCall | undefined {
      return recorded.findLast((call) => method === undefined || call.method === method);
    },
    /** Forgets calls, queued failures and all state. Message ids keep counting. */
    reset(): void {
      recorded.length = 0;
      faults.clear();
      state.reset();
    },
    /** The next `times` calls to `method` fail with `failure` instead of running. */
    failNext(method: string, failure: FakeFailure, times = 1): void {
      faults.add(method, failure, times);
    },
    /** Swaps the time source (message dates, windows, flood control). */
    setClock(next: Clock): void {
      clock.current = next;
    },
    /** Read-only views of the messages the fake knows. */
    messages: {
      get: (chatId: number, messageId: number) => state.messages.get(chatId, messageId),
      list: (chatId?: number) => state.messages.list(chatId),
      /** Messages the bot deleted (or the user's, in private chats). */
      deleted: (chatId?: number) => state.messages.deleted(chatId),
      /** Messages the bot sent, oldest first. */
      sentByBot: (chatId?: number) => state.messages.list(chatId).filter((record) => record.sentByBot),
      last: (chatId?: number) => state.messages.list(chatId).at(-1),
    },
    ephemeralMessages: () => state.ephemeral.list(),
    /** Drafts still visible now: at most 30 seconds old and not followed by a message. */
    activeDrafts: (chatId?: number) => state.drafts.active(state.nowMs(), chatId),
    files: state.files,
    /**
     * The latest document the bot sent (to `chatId` if given), with its name,
     * type and content: what `/export` tests assert on.
     */
    sentDocument(chatId?: number) {
      const record = state.messages
        .list(chatId)
        .findLast((candidate) => candidate.sentByBot && candidate.message.document !== undefined);
      const document = record?.message.document;
      if (record === undefined || document === undefined) return undefined;
      const bytes = state.files.get(document.file_id)?.bytes;
      return {
        message: record.message,
        fileName: document.file_name,
        mimeType: document.mime_type,
        bytes,
        text: bytes === undefined ? undefined : new TextDecoder().decode(bytes),
      };
    },
    get answeredCallbackIds(): readonly string[] {
      return state.queries.ids("callback", true);
    },
    get pendingCallbackIds(): readonly string[] {
      return state.queries.ids("callback", false);
    },
    answeredInlineQueryIds: () => state.queries.ids("inline", true),
    answeredGuestQueryIds: () => state.queries.ids("guest", true),
    /** The bot's reaction to a message: `undefined` if never set, `null` if cleared. */
    reactionOn: (chatId: number, messageId: number) => state.messages.get(chatId, messageId)?.reaction,
    /** Whether a `my_chat_member` update cut the bot off from the chat. */
    isBlocked: (chatId: number) => state.access.isBlocked(chatId),
    /** What the setup script configured. */
    profile: {
      commands: (scopeKey = "default", languageCode = "") => state.profile.commandsFor(scopeKey, languageCode),
      allCommands: () => state.profile.allCommands(),
      names: () => state.profile.allNames(),
      descriptions: () => state.profile.allDescriptions(),
      shortDescriptions: () => state.profile.allShortDescriptions(),
      menuButton: (chatId?: number) => state.profile.menuButton(chatId),
      webhook: () => state.profile.webhook(),
    },
    /**
     * Registers what an update implies (known messages, answerable queries,
     * blocked chats, downloadable files). `kit.deliver` calls it before the
     * bot sees the update; call it yourself when using `bot.handleUpdate`.
     */
    observeUpdate(update: Update): void {
      observeUpdate(state, update);
    },
    /** Makes a message the bot did not send known, so it can be replied to and deleted (private chats). */
    registerIncomingMessage(message: NonNullable<Update["message"]>): void {
      observeUpdate(state, { update_id: 0, message });
    },
  };
}

export type FakeBotApi = ReturnType<typeof createFakeBotApi>;
