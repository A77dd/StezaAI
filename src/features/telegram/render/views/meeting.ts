import type { Slot, Task } from "../../domain";
import { actionButton } from "../buttons";
import { fill } from "../catalog";
import { formatSlotRange, slotHtml } from "../format";
import { link, lines, text } from "../html";
import { keyboard, row } from "../keyboard";
import type { RenderedMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import type { ViewContext } from "./context";
import { titleHtml } from "./shared";

type MeetingCardInput = { readonly task: Task; readonly slot: Slot; readonly quietFollowUp?: boolean };

/** Immediate booking confirmation for a forwarded meeting with a clear time. */
export function meetingBookedView(input: MeetingCardInput, ctx: ViewContext): RenderedMessage {
  const { task, slot, quietFollowUp = false } = input;
  const copy = ctx.catalog.task;
  const hasDetails = typeof task.description === "string" && task.description.trim() !== "";
  const body = quietFollowUp
    ? text(copy.meetingNoDetails)
    : hasDetails ? text(copy.meetingDetailsAdded) : lines(text(copy.meetingSaved), text(copy.meetingDetailsPrompt));
  return renderMessage({
    title: titleHtml(task.title),
    facts: [
      { label: text(copy.when), value: slotHtml(slot, ctx.timezone, ctx.catalog.time) },
      ...(task.meetingUrl === undefined || task.meetingUrl === null ? [] : [{ label: text(copy.meetingLink), value: link(text(copy.openMeeting), task.meetingUrl) }]),
    ],
    body,
    ...(hasDetails ? { details: { summary: text(copy.meetingDetailsLabel), content: text(task.description!), expandable: false } } : {}),
    ...(task.source.hiddenOrigin
      ? { footer: text(copy.hiddenForwardAuthor) }
      : task.source.sourceAuthorUsername === undefined || task.source.sourceAuthorUsername === null
        ? {}
        : { footer: fill(copy.meetingFromUsername, { username: text(`@${task.source.sourceAuthorUsername}`) }) }),
    keyboard: keyboard(
      ...(quietFollowUp
        ? [row(actionButton(copy.meetingAddDetails, "meeting.details", { taskId: task.id }, "primary"))]
        : [
            row(actionButton(task.meetingReminderEnabled === false ? copy.meetingReminderOff : copy.meetingReminderOn, "meeting.reminder", { taskId: task.id, enabled: task.meetingReminderEnabled === false })),
            row(
              actionButton(copy.meetingEditTime, "meeting.time", { taskId: task.id }),
              actionButton(copy.meetingDelete, "meeting.cancel", { taskId: task.id }, "danger"),
            ),
          ]),
    ),
  });
}

export function meetingCancelledView(task: Task, slot: Slot, ctx: ViewContext): RenderedMessage {
  return renderMessage({
    title: titleHtml(task.title),
    facts: [{ label: text(ctx.catalog.task.when), value: text(formatSlotRange(slot, ctx.timezone, ctx.catalog.time)) }],
    body: text(ctx.catalog.task.cancelledNote),
  });
}
