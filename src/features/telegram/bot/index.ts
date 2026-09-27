/**
 * Public API of the bot layer (ADR 0002): the pipeline (`createBot`), the
 * typed context, the presenter that turns rendered messages into Bot API
 * calls, ports and in-memory adapters, and structured logging. Together with
 * `handlers/` this is the only code allowed to import grammY.
 *
 * A handful of lower-level pieces (`bindKeyboard`, `boundedRetry`,
 * `installOutboundPolicy`, `redactTransportErrors`, `createBotContextClass`,
 * `hasAnsweredCallback`) are internals that `createBot`/`presenter` already
 * compose for callers; nothing outside `bot/` used them through this barrel
 * as of this file's last split, so they live in `./testing` instead of here.
 * If a later task (handlers, or a runtime host) genuinely needs one, promote
 * that one export back here rather than reaching into `./testing`.
 */
export { ALLOWED_UPDATES } from "./allowedUpdates";
export type { CallbackOwner } from "./bindKeyboard";
export { DEFAULT_VIEW_TIMEZONE } from "./context";
export type { BotContext, BotContextFlavor } from "./context";
export { createBot } from "./createBot";
export type { CreateBotOptions } from "./createBot";
export { createDraftStream, createDraftStreamRegistry } from "./draftStreams";
export type { ActiveDraftStream, DraftStream, DraftStreamDeps, DraftStreamRegistry } from "./draftStreams";
export { PresenterError, UpdateProcessingError, describeError, errorCodeOf } from "./errors";
export type { ErrorDescription } from "./errors";
export { createInMemoryServices } from "./inMemoryServices";
export type { InMemoryServicesInput } from "./inMemoryServices";
export { createInMemoryUpdateDeduper } from "./inMemoryUpdateDeduper";
export type { InMemoryUpdateDeduperOptions } from "./inMemoryUpdateDeduper";
export { createJsonLogger, createMemoryLogger } from "./logger";
export type { LogFields, Logger, LoggerOptions, LogLevel, LogRecord, LogValue, MemoryLogger } from "./logger";
export type { Sleep } from "./boundedRetry";
export { realSleep } from "./outbound";
export type { UpdateDeduper } from "./ports";
export {
  answerCallback,
  editCard,
  editCardMarkup,
  ownerOf,
  sendCard,
  sendDocument,
  targetOfCallback,
} from "./presenter";
export type { AnswerCallbackOptions, EditOutcome, MessageTarget, SendCardOptions } from "./presenter";
export { REDACTED, redactTokens } from "./redaction";
export type { BotServices } from "./services";
export { classifyTelegramError } from "./telegramErrors";
export type { TelegramErrorKind } from "./telegramErrors";
export { chatContextOf, deriveLocale } from "./updateFacts";
