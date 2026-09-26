import type { KeyboardSpec } from "./buttonSpec";
import type { Html } from "./htmlType";

/**
 * The one shape every user-visible text message is described in. Views fill
 * it from domain data; only `renderMessage` turns it into Telegram HTML, so
 * layout, escaping and limits live in one place. Text parts are branded
 * `Html` (built with `text()` and friends), which is why a plain string
 * cannot reach the message unescaped.
 *
 * The layout wraps some parts in formatting, so they may not contain what
 * Telegram forbids inside it (`code`, `pre`, blockquotes): the title and fact
 * labels are bold, the footer is italic, the summary is bold. A part that
 * breaks this fails with `RenderError` at render time.
 */
export type MessageView = {
  /** Rendered bold on the first line. An empty fragment counts as no title. */
  readonly title?: Html;
  /** Rendered as `label: value` lines with a bold label. Empty array means no facts. */
  readonly facts?: ReadonlyArray<{ readonly label: Html; readonly value: Html }>;
  readonly body?: Html;
  /**
   * Long secondary content (a quoted source message, a transcript). Rendered
   * as a blockquote with a bold summary line; `expandable` collapses it behind
   * a "show more" tap.
   */
  readonly details?: {
    readonly summary: Html;
    readonly content: Html;
    readonly expandable: boolean;
  };
  /** Muted last line, rendered in italics. */
  readonly footer?: Html;
  readonly keyboard?: KeyboardSpec;
};
