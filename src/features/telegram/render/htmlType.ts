/**
 * A fragment of Telegram HTML that is already escaped and well formed.
 *
 * The brand makes the type checker reject plain strings wherever markup is
 * expected, so user text can only enter a message through `text()` (which
 * escapes it). `asHtml` is the one way to claim a string is safe: it is
 * internal to `render/` (not in the barrel) and reserved for code that has
 * itself produced valid markup, such as the builders in `html.ts`.
 */
export type Html = string & { readonly __brand: "TelegramHtml" };

export function asHtml(markup: string): Html {
  return markup as Html;
}
