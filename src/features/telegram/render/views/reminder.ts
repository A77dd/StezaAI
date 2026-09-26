import type { Slot, Task } from "../../domain";
import { actionButton } from "../buttons";
import { fill } from "../catalog";
import { formatDuration, slotHtml } from "../format";
import { text } from "../html";
import type { Html } from "../htmlType";
import { keyboard, row } from "../keyboard";
import type { RenderedMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import type { ViewContext } from "./context";
import { titleHtml } from "./shared";

/**
 * The reminder for a booked block. The CALLER decides the phase, from the
 * reminder's due time and the moment it is actually sent, so the view never
 * reads a clock and a delayed delivery cannot say "time to start" for a
 * block that is over.
 */
export type ReminderInput = {
  readonly task: Pick<Task, "id" | "title">;
  /** The booked block the reminder is about. */
  readonly slot: Slot;
} & (
  | { readonly phase: "before"; readonly minutesUntilStart: number }
  | { readonly phase: "started" }
  | { readonly phase: "overdue" }
);

function bodyOf(input: ReminderInput, ctx: ViewContext): Html {
  const { reminder } = ctx.catalog;
  switch (input.phase) {
    case "before":
      return fill(reminder.startsIn, {
        duration: text(formatDuration(input.minutesUntilStart, ctx.catalog.time)),
      });
    case "started":
      return text(reminder.startsNow);
    case "overdue":
      return text(reminder.overdue);
  }
}

export function reminderView(input: ReminderInput, ctx: ViewContext): RenderedMessage {
  const { reminder, common } = ctx.catalog;
  return renderMessage({
    title: titleHtml(input.task.title),
    facts: [{ label: text(reminder.when), value: slotHtml(input.slot, ctx.timezone, ctx.catalog.time) }],
    body: bodyOf(input, ctx),
    footer: text(reminder.footer),
    keyboard: keyboard(
      row(
        actionButton(reminder.reschedule, "slot.other", { taskId: input.task.id }),
        actionButton(common.edit, "task.edit", { taskId: input.task.id }),
      ),
    ),
  });
}
