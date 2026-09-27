/**
 * Internal barrel of the bot layer: pieces `createBot` and `presenter`
 * already compose for callers, kept out of `./index` because nothing outside
 * `bot/` used them through that barrel (checked when this file was split out
 * of it). `bot/`'s own test files import these directly from their modules,
 * not from here; this barrel exists for a future test harness or runtime host
 * that genuinely needs to reach one of them without duplicating the wiring.
 *
 * Not part of the layer's public surface: if a real caller needs one of
 * these, promote that specific export to `./index` instead of importing this
 * file from outside `bot/`.
 */
export { bindKeyboard } from "./bindKeyboard";
export { boundedRetry, isIdempotentMethod } from "./boundedRetry";
export type { BoundedRetryOptions, RetryReason } from "./boundedRetry";
export { createBotContextClass } from "./context";
export { hasAnsweredCallback } from "./middleware/callbackAnswers";
export { installOutboundPolicy, redactTransportErrors } from "./outbound";
export type { OutboundPolicy } from "./outbound";
