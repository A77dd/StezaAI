import { decodeCallbackData } from "../../callbacks";
import type { CallbackAction } from "../../callbacks";

/**
 * The action name of `data`, without consuming its token (`CallbackStore`'s
 * `resolve` does that, once, and only when a handler decides to act on it).
 * Several composers share one `callback_query` stream; each must be able to
 * ask "is this mine?" before touching the store, or it would consume a token
 * meant for a different action. `undefined` for anything this cannot even
 * decode (garbage, a future version): callers pass it on with `next()`.
 */
export function peekCallbackAction(data: string): CallbackAction | undefined {
  try {
    return decodeCallbackData(data).action;
  } catch {
    return undefined;
  }
}
