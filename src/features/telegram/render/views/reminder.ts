import { MS_PER_MINUTE, parseInstant } from "../../domain";
import type { Slot, Task } from "../../domain";
import { actionButton } from "../buttons";
import { fill } from "../catalog";
import { formatDuration, slotHtml } from "../format";
import { text } from "../html";
import { keyboard, row } from "../keyboard";
import type { RenderedMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import type { ViewContext } from "./context";
import { titleHtml } from "./shared";

export type ReminderInput = {
  readonly task: Pick<Task, "id" | "title">;
  /** The booked block the reminder is about. */
  readonly slot: Slot;
};

/**
 * The reminder before a block. It counts down from `ctx.now`, rounding a
 * partial minute up so "через 1 мин" never reads as already started.
 */
export function reminderView(input: ReminderInput, ctx: ViewContext): RenderedMessage {
  const { reminder, common } = ctx.catalog;
  const minutes = Math.ceil((parseInstant(input.slot.start) - parseInstant(ctx.now)) / MS_PER_MINUTE);
  const body =
    minutes >= 1
      ? fill(reminder.startsIn, { duration: text(formatDuration(minutes, ctx.catalog.time)) })
      : text(reminder.startsNow);

  return renderMessage({
    title: titleHtml(input.task.title),
    facts: [{ label: text(reminder.when), value: slotHtml(input.slot, ctx.timezone, ctx.catalog.time) }],
    body,
    footer: text(reminder.footer),
    keyboard: keyboard(
      row(
        actionButton(reminder.reschedule, "slot.other", { taskId: input.task.id }),
        actionButton(common.edit, "task.edit", { taskId: input.task.id }),
      ),
    ),
  });
}
