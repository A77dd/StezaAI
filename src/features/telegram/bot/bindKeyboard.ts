import type { InlineKeyboardButton, InlineKeyboardMarkup } from "grammy/types";
import type { CallbackStore } from "../callbacks";
import { assertValidKeyboard } from "../render";
import type { ActionButtonSpec, ButtonSpec, KeyboardSpec, SwitchInlineButtonSpec } from "../render";

/** Whose button it is: the callback layer scopes a token to this user and chat. */
export type CallbackOwner = {
  readonly userId: string;
  readonly chatId: number;
};

type IssueInput = Parameters<CallbackStore["issue"]>[0];

/** `switch_inline` says how the query is offered; the Bot API has one field per way. */
function switchInlineButton(button: SwitchInlineButtonSpec): InlineKeyboardButton {
  const { text, query } = button;
  switch (button.mode) {
    case "any":
      return { text, switch_inline_query: query };
    case "current_chat":
      return { text, switch_inline_query_current_chat: query };
    case "chosen_chat":
      // The Bot API needs at least one chat kind. Sharing a card goes to people
      // and groups; bots and channels are not places to schedule in.
      return {
        text,
        switch_inline_query_chosen_chat: {
          ...(query === "" ? {} : { query }),
          allow_user_chats: true,
          allow_group_chats: true,
        },
      };
  }
}

async function actionButton(
  button: ActionButtonSpec,
  owner: CallbackOwner,
  store: CallbackStore,
): Promise<InlineKeyboardButton> {
  // The button's `action` and `payload` are correlated (one union member per
  // action) but TypeScript cannot carry that through the generic `issue`.
  // The store re-validates the payload against the action registry anyway.
  const callbackData = await store.issue({
    action: button.action,
    payload: button.payload,
    userId: owner.userId,
    chatId: owner.chatId,
  } as IssueInput);
  return {
    text: button.text,
    callback_data: callbackData,
    ...(button.style === undefined ? {} : { style: button.style }),
  };
}

async function bindButton(
  button: ButtonSpec,
  owner: CallbackOwner,
  store: CallbackStore,
): Promise<InlineKeyboardButton> {
  switch (button.kind) {
    case "action":
      return actionButton(button, owner, store);
    case "url":
      return { text: button.text, url: button.url };
    case "web_app":
      return { text: button.text, web_app: { url: button.url } };
    case "copy_text":
      return { text: button.text, copy_text: { text: button.copyText } };
    case "switch_inline":
      return switchInlineButton(button);
    case "disabled":
      return { text: button.text, disabled: {} };
  }
}

/**
 * Turns a rendered keyboard into a Bot API `reply_markup`. The only side
 * effect is that every action button gets its own callback token from `store`
 * (in row order, so token issue is deterministic), bound to `owner`.
 *
 * Tokens are issued BEFORE the message is sent. If the send then fails, the
 * tokens stay in the store until their action's TTL runs out and
 * `CallbackStore.purgeExpired` removes them; nobody can use them (no
 * `callback_data` was ever shown) and they are scoped to `owner`, so nothing
 * leaks in the meantime. The store has no per-token release; if orphaned
 * tokens ever matter, that is a `CallbackStore` change, not a workaround here.
 *
 * `null` (no keyboard) gives `undefined`: the field is left out of the call.
 */
export async function bindKeyboard(
  keyboard: KeyboardSpec | null,
  owner: CallbackOwner,
  store: CallbackStore,
): Promise<InlineKeyboardMarkup | undefined> {
  if (keyboard === null) return undefined;
  // Hand-assembled keyboards skip the constructors that validate.
  assertValidKeyboard(keyboard);
  const rows: InlineKeyboardButton[][] = [];
  for (const row of keyboard) {
    const bound: InlineKeyboardButton[] = [];
    for (const button of row) bound.push(await bindButton(button, owner, store));
    rows.push(bound);
  }
  return { inline_keyboard: rows };
}
