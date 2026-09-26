import { urlButton } from "../buttons";
import { text } from "../html";
import { keyboard, row } from "../keyboard";
import { botStartLink } from "../links";
import type { RenderedMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import type { ViewContext } from "./context";

export type GroupPointerInput = {
  /** Deep-link payload (1-64 characters of A-Z a-z 0-9 _ -) that resumes the request in the private chat. */
  readonly startPayload: string;
};

/**
 * The only thing the bot says in a group about a scheduling request: a short
 * public pointer to the private chat. It is identical whether or not time was
 * found, because "no free time" would itself reveal something about the
 * user's calendar. Also fits a guest-mode answer.
 */
export function groupPointerView(input: GroupPointerInput, ctx: ViewContext): RenderedMessage {
  const { group } = ctx.catalog;
  return renderMessage({
    body: text(group.pointer),
    keyboard: keyboard(row(urlButton(group.openPrivate, botStartLink(ctx.botUsername, input.startPayload)))),
  });
}
