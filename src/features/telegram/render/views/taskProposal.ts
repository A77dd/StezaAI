import type { Slot, SlotSearchResult, Task } from "../../domain";
import { actionButton, copyButton, disabledButton } from "../buttons";
import { RenderError } from "../errors";
import { calendarDaysBetween, formatSlotRange, slotHtml } from "../format";
import type { ButtonSpec } from "../buttonSpec";
import { b, lines, s, text } from "../html";
import type { Html } from "../htmlType";
import { keyboard, row } from "../keyboard";
import type { RenderedMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import type { ViewContext } from "./context";
import { assertSlotCount, slotBullets, slotPickButtons, slotStartLabel, taskFacts, titleHtml } from "./shared";

/** The part of a task the card shows. */
export type TaskCard = Pick<Task, "id" | "title" | "deadline" | "durationMinutes">;

/**
 * The personal task card (scenario A) in each state it passes through. The
 * same message is edited from `proposed` to `booked` or `cancelled`, so a
 * resolved card keeps its outcome visible instead of losing its buttons.
 *
 * Timezones: slot BUTTONS and the fallback text of `tg-time` tags use the
 * timezone in the user's settings (`ctx.timezone`), while the tags themselves
 * show each reader's device timezone. If the two differ (travelling, wrong
 * setting) the card text and the button label can disagree; the settings
 * timezone is what the scheduler used, so it is the one the buttons name.
 */
export type TaskProposalInput =
  | { readonly state: "proposed"; readonly task: TaskCard; readonly slots: readonly Slot[] }
  | { readonly state: "booked"; readonly task: TaskCard; readonly slot: Slot }
  | { readonly state: "cancelled"; readonly task: TaskCard }
  | {
      readonly state: "no_slots";
      readonly task: TaskCard;
      readonly search: Pick<SlotSearchResult, "exhausted" | "searchedUntil">;
    };

function secondaryRow(task: TaskCard, ctx: ViewContext, otherTimeStyle?: "primary"): readonly ButtonSpec[] {
  return [
    actionButton(ctx.catalog.common.otherTime, "slot.other", { taskId: task.id }, otherTimeStyle),
    actionButton(ctx.catalog.common.edit, "task.edit", { taskId: task.id }),
  ];
}

function proposed(task: TaskCard, slots: readonly Slot[], ctx: ViewContext): RenderedMessage {
  if (slots.length === 0) throw new RenderError("A proposed card needs a slot; use the no_slots state");
  assertSlotCount(slots);
  const copy = ctx.catalog.task;
  // One slot: the card already says when, so the button is a plain confirmation.
  const picks =
    slots.length === 1
      ? [actionButton(copy.confirm, "slot.pick", { taskId: task.id, slotIndex: 0 }, "success")]
      : slotPickButtons(task.id, slots, (slot) => slotStartLabel(slot, ctx));
  return renderMessage({
    title: titleHtml(task.title),
    facts: taskFacts(task, ctx),
    body: lines(b(text(copy.found)), slotBullets(slots, ctx)),
    keyboard: keyboard(row(...picks), row(...secondaryRow(task, ctx))),
  });
}

function booked(task: TaskCard, slot: Slot, ctx: ViewContext): RenderedMessage {
  const { task: copy } = ctx.catalog;
  const when = { label: text(copy.when), value: slotHtml(slot, ctx.timezone, ctx.catalog.time) };
  const copyText = formatSlotRange(slot, ctx.timezone, ctx.catalog.time);
  return renderMessage({
    title: titleHtml(task.title),
    facts: [...taskFacts(task, ctx), when],
    footer: text(copy.bookedFooter),
    keyboard: keyboard(row(disabledButton(copy.booked)), row(copyButton(copy.copyTime, copyText))),
  });
}

function cancelled(task: TaskCard, ctx: ViewContext): RenderedMessage {
  const { task: copy } = ctx.catalog;
  return renderMessage({
    title: s(titleHtml(task.title)),
    body: text(copy.cancelledNote),
    keyboard: keyboard(row(disabledButton(copy.cancelledButton))),
  });
}

function noSlotsBody(search: Pick<SlotSearchResult, "exhausted" | "searchedUntil">, ctx: ViewContext): Html {
  const copy = ctx.catalog.task;
  switch (search.exhausted) {
    case "none_before_deadline":
      return text(copy.noSlotsBeforeDeadline);
    case "horizon_reached": {
      const days = calendarDaysBetween(ctx.now, search.searchedUntil, ctx.timezone);
      if (days < 1) throw new RenderError("A search that reached its horizon covers at least one day");
      return text(copy.noSlotsHorizon(days));
    }
    case "found":
      throw new RenderError("A search that found slots has no empty-result message");
  }
}

function noSlots(
  task: TaskCard,
  search: Pick<SlotSearchResult, "exhausted" | "searchedUntil">,
  ctx: ViewContext,
): RenderedMessage {
  return renderMessage({
    title: titleHtml(task.title),
    facts: taskFacts(task, ctx),
    body: noSlotsBody(search, ctx),
    keyboard: keyboard(row(...secondaryRow(task, ctx, "primary"))),
  });
}

export function taskProposalView(input: TaskProposalInput, ctx: ViewContext): RenderedMessage {
  switch (input.state) {
    case "proposed":
      return proposed(input.task, input.slots, ctx);
    case "booked":
      return booked(input.task, input.slot, ctx);
    case "cancelled":
      return cancelled(input.task, ctx);
    case "no_slots":
      return noSlots(input.task, input.search, ctx);
  }
}
