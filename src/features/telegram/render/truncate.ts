import { RenderError } from "./errors";
import { escapeHtml, sanitizeText } from "./escape";
import { asHtml } from "./htmlType";
import type { Html } from "./htmlType";
import { tokenizeHtml } from "./htmlTokens";
import { visibleLength } from "./limits";

/**
 * Explicit, opt-in truncation for views whose content may legitimately be
 * cut (for example a long quoted source message). `assertWithinLimit` is the
 * default and never shortens anything; only a view that decides "losing the
 * tail is acceptable here" calls this.
 */

export const DEFAULT_ELLIPSIS = "…";

type OpenTag = { readonly name: string; readonly outputIndex: number };

const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;

/** How many UTF-16 units of `source` fit in `room` without splitting a surrogate pair. */
function fittingUnits(source: string, room: number): number {
  const lastKept = source.charCodeAt(room - 1);
  const splitsPair = lastKept >= HIGH_SURROGATE_START && lastKept <= HIGH_SURROGATE_END;
  return splitsPair ? room - 1 : room;
}

/**
 * Cuts `html` so that `visibleLength(result) <= limit`, ending in `ellipsis`
 * (counted in the limit, placed inside the formatting that was cut so a
 * blockquote or code block keeps it). The cut is always on a text boundary:
 * - never inside a tag, an attribute or an entity (`&amp;` stays whole or is
 *   dropped) and never between the halves of a surrogate pair;
 * - every tag open at the cut is closed, in order, and a tag left with no
 *   content is removed;
 * - a `tg-time` is dropped whole rather than shortened, because its body is
 *   the fallback of a date and half a date misleads.
 * Returns the fragment unchanged when it already fits.
 */
export function truncateHtml(html: Html, limit: number, ellipsis = DEFAULT_ELLIPSIS): Html {
  const ellipsisLength = sanitizeText(ellipsis).length;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RenderError("Truncation limit must be a positive integer");
  }
  if (limit < ellipsisLength) {
    throw new RenderError("Truncation limit is shorter than the ellipsis");
  }
  if (visibleLength(html) <= limit) return html;

  // The fragment is longer than `limit >= budget`, so text always remains
  // beyond the point where `used` reaches `budget`.
  const budget = limit - ellipsisLength;
  const output: string[] = [];
  const open: OpenTag[] = [];
  let used = 0;

  for (const token of tokenizeHtml(html)) {
    if (used >= budget) break;

    if (token.kind === "open") {
      open.push({ name: token.name, outputIndex: output.length });
      output.push(token.source);
      continue;
    }

    if (token.kind === "close") {
      if (open.pop()?.name !== token.name) {
        throw new RenderError("HTML has mismatched tags");
      }
      output.push(token.source);
      continue;
    }

    const room = budget - used;
    if (token.text.length <= room) {
      output.push(token.source);
      used += token.text.length;
      continue;
    }

    // An entity is atomic; a plain text run can be split.
    if (token.source === token.text) {
      const kept = fittingUnits(token.source, room);
      if (kept > 0) output.push(token.source.slice(0, kept));
    }
    break;
  }

  const innermost = open.at(-1);
  if (innermost?.name === "tg-time") {
    output.length = innermost.outputIndex;
    open.pop();
  }
  while (open.length > 0 && open[open.length - 1]?.outputIndex === output.length - 1) {
    output.pop();
    open.pop();
  }

  output.push(escapeHtml(ellipsis));
  for (const tag of open.reverse()) output.push(`</${tag.name}>`);
  return asHtml(output.join(""));
}
