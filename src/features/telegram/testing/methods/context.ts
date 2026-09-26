import type { FakeState } from "../state/fakeState";
import type { Payload } from "../validation/guards";
import type { MessageLookup } from "../validation/sendParams";

export type MethodContext = { readonly state: FakeState };

/**
 * One Bot API method: validates the payload (throwing `ApiRejection` for what
 * the real API would reject), applies it to the fake's state and returns the
 * `result` of the response.
 */
export type MethodHandler = (context: MethodContext, payload: Payload) => unknown;

/** Lets validation see messages the fake knows (reply and quote checks). */
export function messageLookup(context: MethodContext): MessageLookup {
  return (chatId, messageId) => context.state.messages.get(chatId, messageId)?.message;
}
