import { text } from "../html";
import type { RenderedMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import type { ViewContext } from "./context";

/**
 * Final card of the `/demo` streaming simulation (scenario I): what the user
 * sees once the simulated generation finished and the draft was replaced.
 */
export function demoDoneView(ctx: ViewContext): RenderedMessage {
  return renderMessage({
    title: text(ctx.catalog.demo.doneTitle),
    body: text(ctx.catalog.demo.doneNote),
  });
}
