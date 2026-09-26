import { RenderError } from "./errors";
import { BLANK_LINE, b, i, join, lines, quote, text } from "./html";
import type { Html } from "./htmlType";
import { assertValidKeyboard } from "./keyboard";
import { TEXT_LIMIT, assertWithinLimit } from "./limits";
import type { MessageView } from "./messageView";
import type { RenderedTextMessage } from "./rendered";

type Fact = NonNullable<MessageView["facts"]>[number];
type Details = NonNullable<MessageView["details"]>;

const FACT_SEPARATOR = text(": ");

function renderFact({ label, value }: Fact): Html {
  return join([b(label), FACT_SEPARATOR, value]);
}

function renderDetails({ summary, content, expandable }: Details): Html {
  return quote(lines(b(summary), content), { expandable });
}

function isPresent(html: Html | undefined): html is Html {
  return html !== undefined && html !== "";
}

/** Blocks in reading order; empty fragments count as absent. */
function collectBlocks(view: MessageView): Html[] {
  const blocks: Html[] = [];
  if (isPresent(view.title)) blocks.push(b(view.title));
  if (view.facts !== undefined && view.facts.length > 0) {
    blocks.push(lines(...view.facts.map(renderFact)));
  }
  if (isPresent(view.body)) blocks.push(view.body);
  if (view.details !== undefined) blocks.push(renderDetails(view.details));
  if (isPresent(view.footer)) blocks.push(i(view.footer));
  return blocks;
}

/**
 * Composes a `MessageView` into Telegram HTML: bold title, facts, body,
 * details blockquote, italic footer, each block separated by a blank line.
 * Deterministic and pure. Text over 4096 characters (after entity parsing)
 * throws `MessageTooLongError`: nothing is truncated here, a view that may
 * lose text must apply `truncateHtml` to that part itself.
 */
export function renderMessage(view: MessageView): RenderedTextMessage {
  const blocks = collectBlocks(view);
  if (blocks.length === 0) throw new RenderError("A message needs at least one non-empty part");
  if (view.keyboard !== undefined) assertValidKeyboard(view.keyboard);

  const html = assertWithinLimit(join(blocks, BLANK_LINE), TEXT_LIMIT);
  return {
    kind: "text",
    text: html,
    parseMode: "HTML",
    linkPreview: "disabled",
    keyboard: view.keyboard ?? null,
  };
}
