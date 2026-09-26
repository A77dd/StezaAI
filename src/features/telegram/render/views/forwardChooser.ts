import type { IntentKind, Slot, SlotProposal, SourceRef } from "../../domain";
import type { ButtonRow, ButtonSpec } from "../buttonSpec";
import { actionButton } from "../buttons";
import { fill } from "../catalog";
import { BLANK_LINE, join, lines, text } from "../html";
import type { Html } from "../htmlType";
import type { MessageView } from "../messageView";
import { row } from "../keyboard";
import type { RenderedMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import { truncateHtml } from "../truncate";
import type { ViewContext } from "./context";
import {
  NAME_MAX_LENGTH,
  SOURCE_PREVIEW_MAX_LENGTH,
  chunkRows,
  compactKeyboard,
  slotBullets,
  slotPickButtons,
  slotStartLabel,
  titleHtml,
  userLine,
} from "./shared";

type SchedulingKind = Exclude<IntentKind, "info">;

/**
 * A forwarded message the bot could not turn into a ready task card (scenario
 * B): either something to schedule (a meeting, a reminder, a follow-up) with
 * the free windows found for it, or plain information the bot asks to
 * remember. A task-like forward is a `taskProposal` card instead.
 */
export type ForwardChooserInput = {
  readonly draftId: string;
  readonly title: string;
  readonly source: Pick<SourceRef, "sourceText" | "sourceAuthor" | "hiddenOrigin">;
  /** Other readings offered as buttons; the current one and duplicates are dropped. */
  readonly alternatives: readonly IntentKind[];
} & (
  | { readonly kind: "info" }
  | { readonly kind: SchedulingKind; readonly proposal: SlotProposal }
);

const ALTERNATIVES_PER_ROW = 2;

function sourceQuote(source: ForwardChooserInput["source"], ctx: ViewContext): MessageView["details"] {
  const content = source.sourceText.trim();
  if (content === "") return undefined;
  const { forward } = ctx.catalog;
  const summary =
    source.hiddenOrigin || source.sourceAuthor === null
      ? text(forward.sourceHidden)
      : fill(forward.sourceFrom, { author: userLine(source.sourceAuthor, NAME_MAX_LENGTH) });
  return {
    summary,
    content: truncateHtml(text(content), SOURCE_PREVIEW_MAX_LENGTH),
    expandable: true,
  };
}

function alternativeRows(input: ForwardChooserInput, ctx: ViewContext): ButtonRow[] {
  const kinds = [...new Set(input.alternatives)].filter((kind) => kind !== input.kind);
  const buttons = kinds.map((kind) =>
    actionButton(ctx.catalog.forward.alternatives[kind], "intent.choose", { draftId: input.draftId, kind }),
  );
  return chunkRows(buttons, ALTERNATIVES_PER_ROW);
}

function schedulingBody(kind: SchedulingKind, title: string, slots: readonly Slot[], ctx: ViewContext): Html {
  const { forward } = ctx.catalog;
  const intro = fill(forward.intro[kind], { title: titleHtml(title) });
  const free =
    slots.length === 0
      ? text(forward.noSlots)
      : lines(text(forward.freeTime), slotBullets(slots, ctx));
  return join([intro, free], BLANK_LINE);
}

function scheduling(
  input: ForwardChooserInput & { readonly kind: SchedulingKind },
  ctx: ViewContext,
): RenderedMessage {
  const { taskId, slots } = input.proposal;
  const picks: ButtonSpec[] = slotPickButtons(taskId, slots, (slot) => slotStartLabel(slot, ctx));
  const otherTime = actionButton(ctx.catalog.common.otherTime, "slot.other", { taskId });
  return renderMessage({
    body: schedulingBody(input.kind, input.title, slots, ctx),
    details: sourceQuote(input.source, ctx),
    keyboard: compactKeyboard([
      picks.length === 0 ? null : row(...picks),
      row(otherTime),
      ...alternativeRows(input, ctx).map((buttons) => row(...buttons)),
    ]),
  });
}

function information(input: ForwardChooserInput, ctx: ViewContext): RenderedMessage {
  const { forward } = ctx.catalog;
  const remember = actionButton(
    forward.remember,
    "context.choose",
    { draftId: input.draftId, choice: "remember" },
    "success",
  );
  return renderMessage({
    body: fill(forward.info, { title: titleHtml(input.title) }),
    details: sourceQuote(input.source, ctx),
    footer: text(forward.rememberNote),
    keyboard: compactKeyboard([row(remember), ...alternativeRows(input, ctx).map((buttons) => row(...buttons))]),
  });
}

export function forwardChooserView(input: ForwardChooserInput, ctx: ViewContext): RenderedMessage {
  return input.kind === "info" ? information(input, ctx) : scheduling(input, ctx);
}
