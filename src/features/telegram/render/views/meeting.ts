import type { ActionButtonSpec } from "../buttonSpec";
import type { Instant, Interval, Slot, Task } from "../../domain";
import { addMinutes, fromZoned, parseInstant, toZonedParts } from "../../domain";
import { actionButton } from "../buttons";
import { fill, fillPlain } from "../catalog";
import { formatSlotRange, slotHtml } from "../format";
import { link, lines, text } from "../html";
import { keyboard, row } from "../keyboard";
import { createRichDocument, disabledCell, richEscape, type RichCell } from "../rich";
import type { RenderedMessage, RenderedRichHtmlMessage } from "../rendered";
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

/**
 * The Rich version of the meeting card (the approved interactive design):
 * the actions are buttons INSIDE the message body — reminder toggle, time
 * change, delete, the meeting link as a url button — and the details live in
 * an expandable block. The HTML card above stays as the fallback rendering.
 */
export function meetingBookedRichView(input: MeetingCardInput, ctx: ViewContext): RenderedRichHtmlMessage {
  const { task, slot, quietFollowUp = false } = input;
  const copy = ctx.catalog.task;
  const hasDetails = typeof task.description === "string" && task.description.trim() !== "";
  const doc = createRichDocument();

  doc.heading(task.title);
  doc.line(`Когда: ${formatSlotRange(slot, ctx.timezone, ctx.catalog.time)}`);
  if (quietFollowUp) {
    doc.line(copy.meetingNoDetails);
  } else if (hasDetails) {
    doc.line(copy.meetingDetailsAdded);
    doc.raw(
      `<details><summary>${richEscape(copy.meetingDetailsLabel)}</summary>${richEscape(task.description!)}</details>`,
    );
  } else {
    doc.line(copy.meetingDetailsPrompt);
  }
  if (task.source.hiddenOrigin) {
    doc.raw(`<footer>${richEscape(copy.hiddenForwardAuthor)}</footer>`);
  } else if (task.source.sourceAuthorUsername !== undefined && task.source.sourceAuthorUsername !== null) {
    doc.raw(`<footer>${richEscape(fillPlain(copy.meetingFromUsername, { username: `@${task.source.sourceAuthorUsername}` }))}</footer>`);
  }

  if (task.meetingUrl !== undefined && task.meetingUrl !== null && URL.canParse(task.meetingUrl) && new URL(task.meetingUrl).protocol === "https:") {
    doc.buttonRow([{ kind: "url", label: `🔗 ${copy.openMeeting}`, url: task.meetingUrl }]);
  }
  // The action/payload pair is re-validated by the callback registry (the
  // generic correlation cannot cross this helper, same as the calendar).
  const reminder: RichCell = {
    kind: "action",
    button: actionButton(
      task.meetingReminderEnabled === false ? copy.meetingReminderOff : copy.meetingReminderOn,
      "meeting.reminder" as never,
      { taskId: task.id, enabled: task.meetingReminderEnabled === false } as never,
    ) as ActionButtonSpec,
  };
  if (quietFollowUp) {
    doc.buttonRow([{ kind: "action", button: actionButton(copy.meetingAddDetails, "meeting.details" as never, { taskId: task.id } as never, "primary") as ActionButtonSpec }]);
  } else {
    doc.buttonRow([reminder]);
    doc.buttonRow([
      { kind: "action", button: actionButton(copy.meetingEditTime, "meeting.time" as never, { taskId: task.id } as never) as ActionButtonSpec },
      { kind: "action", button: actionButton(copy.meetingDelete, "meeting.cancel" as never, { taskId: task.id } as never, "danger") as ActionButtonSpec },
    ]);
  }
  const built = doc.build();
  return { kind: "rich_html", html: built.html, actions: built.actions, keyboard: null };
}

/** The Rich version of the cancellation confirmation. */
export function meetingCancelledRichView(task: Task, slot: Slot, ctx: ViewContext): RenderedRichHtmlMessage {
  const doc = createRichDocument();
  doc.heading(task.title);
  doc.line(formatSlotRange(slot, ctx.timezone, ctx.catalog.time));
  doc.line(ctx.catalog.task.cancelledNote);
  const built = doc.build();
  return { kind: "rich_html", html: built.html, actions: built.actions, keyboard: null };
}

/**
 * The interactive reschedule calendar (the approved rich design): the user's
 * own month grid — past days are dead, every future day opens an hour grid,
 * and busy hours come from the user's calendar. The free-text alternative
 * stays armed on this message ("напишите время текстом").
 */
export type MeetingRescheduleView = { readonly year: number; readonly month: number; readonly day?: number };

export type MeetingRescheduleInput = {
  readonly task: Task;
  readonly slot: Slot;
  /** The user's busy intervals for the rendered month (queried by the handler). */
  readonly busy: readonly Interval[];
  /** The message id of the original meeting card, carried through reschedule buttons. */
  readonly cardMessageId: number;
  readonly now: Instant;
};

function hourIsBusy(input: MeetingRescheduleInput, year: number, month: number, day: number, hour: number, ctx: ViewContext): boolean {
  const start = fromZoned({ year, month, day, hour, minute: 0 }, ctx.timezone);
  const end = addMinutes(start, 60);
  return input.busy.some((interval) => parseInstant(interval.end) > parseInstant(start) && parseInstant(interval.start) < parseInstant(end));
}

export function meetingRescheduleView(
  input: MeetingRescheduleInput,
  view: MeetingRescheduleView,
  ctx: ViewContext,
): RenderedRichHtmlMessage {
  const time = ctx.catalog.time;
  const doc = createRichDocument();
  doc.heading(ctx.catalog.task.meetingRescheduleTitle);
  doc.line(fillPlain(ctx.catalog.task.meetingRescheduleCurrent, { slot: formatSlotRange(input.slot, ctx.timezone, time) }));

  const todayParts = toZonedParts(input.now, ctx.timezone);
  const isPastDay = (day: number): boolean =>
    view.year < todayParts.year || (view.year === todayParts.year && (view.month < todayParts.month || (view.month === todayParts.month && day < todayParts.day)));

  const firstWeekday = new Date(Date.UTC(view.year, view.month - 1, 1)).getUTCDay() || 7;
  const daysInMonth = new Date(Date.UTC(view.year, view.month, 0)).getUTCDate();
  for (let rowStart = 1 - (firstWeekday - 1); rowStart <= daysInMonth; rowStart += 7) {
    const cells: RichCell[] = [];
    for (let cell = 0; cell < 7; cell += 1) {
      const day = rowStart + cell;
      if (day < 1 || day > daysInMonth || isPastDay(day)) {
        cells.push(disabledCell("·"));
        continue;
      }
      cells.push(
        day === view.day
          ? disabledCell(String(day))
          : {
              kind: "action",
              button: actionButton(String(day), "meeting.reschedule.day" as never, {
                taskId: input.task.id, cardMessageId: input.cardMessageId, year: view.year, month: view.month, day,
              } as never, "primary") as never,
            },
      );
    }
    doc.buttonRow(cells);
  }

  const nav: RichCell[] = [];
  const monthIndex = view.year * 12 + (view.month - 1);
  const nowIndex = todayParts.year * 12 + (todayParts.month - 1);
  if (monthIndex > nowIndex) {
    nav.push({
      kind: "action",
      button: actionButton("‹", "meeting.reschedule.month" as never, {
        taskId: input.task.id, cardMessageId: input.cardMessageId,
        ...(view.month === 1 ? { year: view.year - 1, month: 12 } : { year: view.year, month: view.month - 1 }),
      } as never) as never,
    });
  }
  nav.push(disabledCell(`${time.monthsShort[view.month - 1]} ${view.year}`));
  if (monthIndex - nowIndex < 3) {
    nav.push({
      kind: "action",
      button: actionButton("›", "meeting.reschedule.month" as never, {
        taskId: input.task.id, cardMessageId: input.cardMessageId,
        ...(view.month === 12 ? { year: view.year + 1, month: 1 } : { year: view.year, month: view.month + 1 }),
      } as never) as never,
    });
  }
  doc.buttonRow(nav);

  if (view.day !== undefined) {
    const dateLabel = time.date(view.day, time.monthsShort[view.month - 1], view.year === todayParts.year ? null : view.year);
    doc.line(`${dateLabel}:`);
    let row: RichCell[] = [];
    for (let hour = 8; hour <= 20; hour += 1) {
      const cell = hourIsBusy(input, view.year, view.month, view.day, hour, ctx)
        ? disabledCell(`${hour}:00`)
        : {
            kind: "action" as const,
            button: actionButton(`${hour}:00`, "meeting.reschedule.hour" as never, {
              taskId: input.task.id, cardMessageId: input.cardMessageId, year: view.year, month: view.month, day: view.day, hour,
            } as never, "success") as never,
          };
      row.push(cell);
      if (row.length === 7) {
        doc.buttonRow(row);
        row = [];
      }
    }
    if (row.length > 0) doc.buttonRow(row);
  }

  // The free-text alternative stays available on this very message.
  doc.line(ctx.catalog.task.meetingTimePrompt);
  const built = doc.build();
  return { kind: "rich_html", html: built.html, actions: built.actions, keyboard: null };
}
