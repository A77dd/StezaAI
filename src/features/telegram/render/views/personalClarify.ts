import type { IntentKind } from "../../domain";
import { actionButton } from "../buttons";
import { fill } from "../catalog";
import { keyboard, row } from "../keyboard";
import type { RenderedMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import { text } from "../html";
import type { ViewContext } from "./context";
import { chunkRows, titleHtml } from "./shared";

/**
 * Kinds offered by the personal clarify chooser, in display order. Reuses
 * `catalog.forward.alternatives` (Task 4) for the button labels: the question
 * "what kind of thing is this" is the same one `forwardChooserView` asks, just
 * without a forwarded source and without a proposal computed yet (a bare
 * low-confidence personal message has no kind committed, so there is nothing
 * to search slots for until one is chosen).
 */
const CLARIFY_KINDS: readonly IntentKind[] = ["task", "meeting", "reminder", "follow_up", "info"];
const BUTTONS_PER_ROW = 2;

export type PersonalClarifyInput = {
  readonly draftId: string;
  /** The parser's best guess at a title, shown so the user knows what they are classifying. */
  readonly title: string;
};

/**
 * `submitText`'s `needs_clarification` result (Task 7a): the parser's
 * confidence was too low to act on. Every button resolves through
 * `chooseIntent` (`intent.choose`).
 */
export function personalClarifyView(input: PersonalClarifyInput, ctx: ViewContext): RenderedMessage {
  const { personal } = ctx.catalog;
  const buttons = CLARIFY_KINDS.map((kind) =>
    actionButton(ctx.catalog.forward.alternatives[kind], "intent.choose", { draftId: input.draftId, kind }),
  );
  return renderMessage({
    body: fill(personal.clarifyIntro, { title: titleHtml(input.title) }),
    footer: text(personal.clarifyQuestion),
    keyboard: keyboard(...chunkRows(buttons, BUTTONS_PER_ROW)),
  });
}

export type PersonalInfoOnlyInput = {
  readonly draftId: string;
  readonly title: string;
};

/**
 * `submitText`'s `info_only` result: a definitive `info` classification, not a
 * low-confidence guess, so it is offered as a note to keep rather than a kind
 * to pick. Unlike a forward (`forwardChooserView`), there is no source to
 * quote and nothing was hidden or forwarded, so this does not reuse that view
 * (it would wrongly label the message "Forwarded"). The single button goes
 * through `context.choose` (`{ choice: "remember" }`), which `chooseIntent`
 * treats exactly like picking the `info` kind: nothing is persisted until
 * this is pressed (AGENTS.md: a meaningful inferred memory item needs
 * confirmation).
 */
export function personalInfoOnlyView(input: PersonalInfoOnlyInput, ctx: ViewContext): RenderedMessage {
  const { forward } = ctx.catalog;
  return renderMessage({
    body: fill(forward.info, { title: titleHtml(input.title) }),
    footer: text(forward.rememberNote),
    keyboard: keyboard(
      row(actionButton(forward.remember, "context.choose", { draftId: input.draftId, choice: "remember" }, "success")),
    ),
  });
}
