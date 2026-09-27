/**
 * Public API of the render layer (ADR 0002): pure, synchronous functions that
 * turn view models into plain data (Telegram HTML text, button specs). No
 * grammY types, no I/O, no callback-store access; handlers convert the output
 * into Bot API calls.
 *
 * `asHtml` (the unchecked way to brand a string as `Html`) is deliberately not
 * exported: outside this folder, markup is only built with `html.ts`.
 */
export * from "./buttons";
export type * from "./buttonSpec";
export * from "./catalog";
export * from "./dayLabel";
export * from "./errors";
export * from "./escape";
export * from "./format";
export * from "./rich";
export * from "./html";
export type { Html } from "./htmlType";
export * from "./keyboard";
export * from "./limits";
export * from "./links";
export * from "./markdown";
export * from "./moment";
export type { MessageView } from "./messageView";
export * from "./rendered";
export * from "./renderMessage";
export * from "./renderRichMarkdown";
export * from "./timeWords";
export * from "./truncate";
export * from "./views";
