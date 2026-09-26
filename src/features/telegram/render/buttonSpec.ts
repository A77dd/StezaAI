import type { CallbackAction, CallbackPayload } from "../callbacks";

/**
 * Buttons as plain data. A view says WHAT a button does (an action and its
 * payload), never how it travels: turning `action` buttons into
 * `callback_data` needs the async `CallbackStore` (token issue), so a later
 * layer (handlers) converts `KeyboardSpec` into Telegram `reply_markup`.
 * Rendering stays pure and never touches the store.
 */

/** Native button colours (Bot API 9.4): blue, green, red. Unset means the client default. */
export type ButtonStyle = "primary" | "success" | "danger";

/** `switch_inline_query_current_chat`, `switch_inline_query_chosen_chat`, `switch_inline_query`. */
export type SwitchInlineMode = "current_chat" | "chosen_chat" | "any";

/** One member per registered action, so `payload` is typed by `action`. */
export type ActionButtonSpec = {
  [A in CallbackAction]: {
    readonly kind: "action";
    readonly text: string;
    readonly action: A;
    readonly payload: CallbackPayload<A>;
    readonly style?: ButtonStyle;
  };
}[CallbackAction];

export type UrlButtonSpec = {
  readonly kind: "url";
  readonly text: string;
  readonly url: string;
};

export type WebAppButtonSpec = {
  readonly kind: "web_app";
  readonly text: string;
  readonly url: string;
};

export type CopyTextButtonSpec = {
  readonly kind: "copy_text";
  readonly text: string;
  readonly copyText: string;
};

export type SwitchInlineButtonSpec = {
  readonly kind: "switch_inline";
  readonly text: string;
  readonly query: string;
  readonly mode: SwitchInlineMode;
};

/** Inactive button, used to keep a resolved card's outcome visible ("Поставлено"). */
export type DisabledButtonSpec = {
  readonly kind: "disabled";
  readonly text: string;
};

export type ButtonSpec =
  | ActionButtonSpec
  | UrlButtonSpec
  | WebAppButtonSpec
  | CopyTextButtonSpec
  | SwitchInlineButtonSpec
  | DisabledButtonSpec;

export type ButtonRow = readonly ButtonSpec[];
export type KeyboardSpec = readonly ButtonRow[];
