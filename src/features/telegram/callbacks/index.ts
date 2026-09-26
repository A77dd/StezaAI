/**
 * Public API of the callback layer (ADR 0002): versioned `callback_data`
 * codec, action registry and the server-side `CallbackStore`. Framework-free:
 * it must not import grammY (only `bot/` and `handlers/` may).
 */
export * from "./actions";
export * from "./codec";
export * from "./errors";
export * from "./inMemoryCallbackStore";
export * from "./ports";
export * from "./tokens";
