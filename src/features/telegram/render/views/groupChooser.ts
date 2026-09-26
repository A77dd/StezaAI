import { actionButton } from "../buttons";
import { text } from "../html";
import { keyboard, row } from "../keyboard";
import type { RenderedMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import type { ViewContext } from "./context";
import { quoted, titleHtml } from "./shared";

export type GroupChooserInput = {
  readonly draftId: string;
  /** What the group message was understood to be about; it was public in the group already. */
  readonly title: string;
};

/**
 * Scenario C, ambiguous intent: "Что сделать?" with the three choices. The
 * message is shown in the group, so it carries the group message's own topic
 * and nothing from anyone's calendar.
 */
export function groupChooserView(input: GroupChooserInput, ctx: ViewContext): RenderedMessage {
  const { group } = ctx.catalog;
  const choose = (label: string, choice: "personal" | "group" | "remember", style?: "primary") =>
    row(actionButton(label, "context.choose", { draftId: input.draftId, choice }, style));

  return renderMessage({
    title: text(group.chooserTitle),
    body: quoted(ctx, titleHtml(input.title)),
    keyboard: keyboard(
      choose(group.personal, "personal", "primary"),
      choose(group.team, "group"),
      choose(group.remember, "remember"),
    ),
  });
}
