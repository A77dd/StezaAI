import type { ActionButtonSpec } from "../buttonSpec";
import type { Instant, BusyEvent, Interval, Slot, Task } from "../../domain";
import { addMinutes, fromZoned, parseInstant, toZonedParts } from "../../domain";
import { actionButton } from "../buttons";
import { fill, fillPlain } from "../catalog";
import { formatSlotRange, slotHtml } from "../format";
import { link, lines, text } from "../html";
import { keyboard, row } from "../keyboard";
import { copyCell, createRichDocument, disabledCell, richEscape, type RichCell } from "../rich";
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

const MEETING_TIME_BUTTONS_PER_ROW = 4;

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
      if (row.length === MEETING_TIME_BUTTONS_PER_ROW) {
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

// --- Conflict scenario (the approved preview: shared timeline + three actions) ---

const TICK_MINUTES = 30;

/**
 * A validated callback button for a rich row; the callback registry
 * re-validates the action/payload pair at runtime.
 */
function pick(
  label: string,
  action: "meeting.conflict.accept" | "meeting.conflict.slots" | "meeting.conflict.keep" | "meeting.conflict.move" | "meeting.conflict.move.confirm" | "meeting.reschedule.day" | "meeting.reschedule.hour" | "meeting.reschedule.month",
  payload: Record<string, unknown>,
  style?: "primary" | "success" | "danger",
): RichCell {
  return {
    kind: "action",
    button: actionButton(label, action as never, payload as never, style) as ActionButtonSpec,
  };
}

function clockOf(instant: string, ctx: ViewContext): string {
  const parts = toZonedParts(instant, ctx.timezone);
  return `${parts.hour}:${String(parts.minute).padStart(2, "0")}`;
}

function rangeOf(start: string, end: string, ctx: ViewContext): string {
  return `${clockOf(start, ctx)}–${clockOf(end, ctx)}`;
}

export type MeetingConflictInput = {
  readonly task: Task;
  /** The requested (busy) slot of the forwarded meeting. */
  readonly requested: Interval;
  /** The events the requested slot collided with, as the calendar returned them. */
  readonly busy: readonly BusyEvent[];
  /** The fresh proposal to offer instead; the first slot is the headline suggestion. */
  readonly proposalSlots: readonly Slot[];
  /** Render inert controls for `/demo_conflict`; no callback may mutate user data. */
  readonly demo?: boolean;
};

/**
 * The conflict card: the requested slot and the colliding events on one
 * timeline (an officially supported `<table>` with `colspan` bars), then the
 * three actions. The existing event's name appears only when the calendar
 * actually returned one — otherwise the bar reads "Занято".
 */
export function meetingConflictRichView(input: MeetingConflictInput, ctx: ViewContext): RenderedRichHtmlMessage {
  const copy = ctx.catalog.task;
  const time = ctx.catalog.time;
  const doc = createRichDocument();

  const requestedLabel = fillPlain(copy.meetingConflictWhen, {
    day: time.weekdaysShort[toZonedParts(input.requested.start, ctx.timezone).isoWeekday - 1] ?? "",
    range: rangeOf(input.requested.start, input.requested.end, ctx),
  });
  doc.line(requestedLabel);
  doc.heading(copy.meetingConflictTitle);
  doc.line(copy.meetingConflictTimeline);

  // The requested meeting and colliding events share one timeline, aligned to
  // whole hours. 15-minute columns; ticks label every half hour.
  const HOUR = 60 * 60_000;
  const marks = [input.requested, ...input.busy.map((event) => ({ start: event.start, end: event.end }))];
  const windowStart = Math.floor(Math.min(...marks.map((m) => parseInstant(m.start))) / HOUR) * HOUR;
  const windowEnd = Math.ceil(Math.max(...marks.map((m) => parseInstant(m.end))) / HOUR) * HOUR;
  const columns = Math.min(20, Math.max(1, Math.round((windowEnd - windowStart) / (TICK_MINUTES * 60_000))));

  const bar = (start: number, end: number, label: string): string => {
    const lead = Math.max(0, Math.round((start - windowStart) / (TICK_MINUTES * 60_000)));
    const span = Math.max(1, Math.round((end - start) / (TICK_MINUTES * 60_000)));
    const tail = Math.max(0, columns - lead - span);
    return `${lead > 0 ? `<td colspan="${lead}"></td>` : ""}<td colspan="${span}">${richEscape(label)}</td>${tail > 0 ? `<td colspan="${tail}"></td>` : ""}`;
  };

  const rows: string[] = [];
  const proposed = input.proposalSlots[0];
  if (proposed === undefined) throw new Error("meetingConflict: a conflict card needs a proposed slot");
  rows.push(
    `<tr>${bar(parseInstant(input.requested.start), parseInstant(input.requested.end), `${copy.meetingConflictNew} · ${rangeOf(input.requested.start, input.requested.end, ctx)}`)}</tr>`,
  );
  for (const event of [...input.busy].sort((a, b) => parseInstant(a.start) - parseInstant(b.start))) {
    const name = event.title ?? copy.meetingBusyFallback;
    rows.push(`<tr>${bar(parseInstant(event.start), parseInstant(event.end), `${name} · ${rangeOf(event.start, event.end, ctx)}`)}</tr>`);
  }
  const tickCount = Math.floor(columns / 2) + 1;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const tick = windowStart + i * 2 * TICK_MINUTES * 60_000;
    return `<td colspan="2">${richEscape(clockOf(new Date(tick).toISOString(), ctx))}</td>`;
  }).join("");
  doc.raw(`<table>${rows.join("")}<tr>${ticks}</tr></table>`);

  doc.line(`${copy.meetingConflictNew}: ${input.task.title} · ${rangeOf(input.requested.start, input.requested.end, ctx)}`);
  for (const event of input.busy) {
    const name = event.title ?? copy.meetingBusyFallback;
    doc.line(`${copy.meetingConflictExisting}: ${name} · ${rangeOf(event.start, event.end, ctx)}`);
  }
  doc.line(fillPlain(copy.meetingConflictFree, { slot: rangeOf(proposed.start, proposed.end, ctx) }));
  doc.line(copy.meetingConflictHow);

  const acceptLabel = fillPlain(copy.meetingConflictAccept, { slot: rangeOf(proposed.start, proposed.end, ctx) });
  if (input.demo) {
    doc.buttonRow([disabledCell(acceptLabel)]);
    doc.buttonRow([disabledCell(copy.meetingConflictOther)]);
    doc.buttonRow([disabledCell(copy.meetingConflictKeep)]);
  } else {
    doc.buttonRow([
      pick(
        acceptLabel,
        "meeting.conflict.accept",
        {
          taskId: input.task.id,
          slotIndex: input.proposalSlots.indexOf(proposed),
          slotStart: proposed.start,
          slotEnd: proposed.end,
          requestedStart: input.requested.start,
          requestedEnd: input.requested.end,
        },
        "primary",
      ),
    ]);
    doc.buttonRow([pick(copy.meetingConflictOther, "meeting.conflict.slots", { taskId: input.task.id })]);
    doc.buttonRow([
      pick(copy.meetingConflictKeep, "meeting.conflict.keep", {
        taskId: input.task.id,
        requestedStart: input.requested.start,
        requestedEnd: input.requested.end,
      }),
    ]);
  }
  // Moving the user's own meeting is offered only when the calendar knows it.
  const ownEvent = input.busy.find((event) => event.taskId !== undefined);
  if (ownEvent !== undefined && ownEvent.taskId !== undefined) {
    const moveLabel = fillPlain(copy.meetingMoveAsk, {
      task: ownEvent.title ?? copy.meetingBusyFallback,
      new: rangeOf(proposed.start, proposed.end, ctx),
    });
    if (input.demo) {
      doc.buttonRow([disabledCell(moveLabel)]);
    } else {
      doc.buttonRow([
        pick(
          moveLabel,
          "meeting.conflict.move",
          { taskId: input.task.id, existingTaskId: ownEvent.taskId, proposedStart: proposed.start },
        ),
      ]);
    }
  }
  doc.raw(`<footer>${richEscape(copy.meetingConflictQuiet)}</footer>`);
  if (input.demo) doc.line(copy.meetingConflictDemo);
  const built = doc.build();
  return { kind: "rich_html", html: built.html, actions: built.actions, keyboard: null };
}

export type MeetingNegotiationInput = {
  /** "Встреча добавлена на 18:00." or the keep-note. */
  readonly headline: string;
  readonly requested: Interval;
  /** The suggested alternative slot, when one was offered. */
  readonly suggested: Slot | null;
  readonly username: string | null;
};

/**
 * What to tell the counterpart: the suggested phrase (the user sends it
 * themselves) with native copy and, when the forward carried a username, a
 * deep link to that chat. Nothing is sent by the bot.
 */
export function meetingNegotiationRichView(input: MeetingNegotiationInput, ctx: ViewContext): RenderedRichHtmlMessage {
  const copy = ctx.catalog.task;
  const doc = createRichDocument();
  doc.heading(input.headline);
  doc.line(copy.meetingNegotiateIntro);
  const when = rangeOf(input.requested.start, input.requested.end, ctx);
  const phrase =
    input.suggested === null
      ? fillPlain(copy.meetingSuggestKept, { when })
      : fillPlain(copy.meetingSuggestFree, { when, slot: rangeOf(input.suggested.start, input.suggested.end, ctx) });
  doc.line(phrase);
  doc.buttonRow([copyCell(copy.meetingCopyButton, phrase)]);
  if (input.username !== null) {
    doc.buttonRow([
      { kind: "url", label: fillPlain(copy.meetingOpenChat, { username: `@${input.username}` }), url: `https://t.me/${input.username}` },
    ]);
  }
  const built = doc.build();
  return { kind: "rich_html", html: built.html, actions: built.actions, keyboard: null };
}

export type MeetingMoveConfirmInput = {
  readonly existingTitle: string;
  readonly existingTaskId: string;
  readonly existingSlot: Slot;
  readonly proposed: Slot;
  /** The new (conflicting) meeting the user is trying to book. */
  readonly taskId: string;
};

/** The separate confirmation before an existing meeting is moved. */
export function meetingMoveConfirmRichView(input: MeetingMoveConfirmInput, ctx: ViewContext): RenderedRichHtmlMessage {
  const copy = ctx.catalog.task;
  const doc = createRichDocument();
  doc.line(copy.meetingRescheduleTitle);
  doc.line(
    fillPlain(copy.meetingMoveAsk, {
      task: input.existingTitle,
      old: rangeOf(input.existingSlot.start, input.existingSlot.end, ctx),
      new: rangeOf(input.proposed.start, input.proposed.end, ctx),
    }),
  );
  doc.buttonRow([
    pick(
      fillPlain(copy.meetingMoveYes, { task: input.existingTitle }),
      "meeting.conflict.move.confirm",
      { taskId: input.taskId, existingTaskId: input.existingTaskId, proposedStart: input.proposed.start },
      "primary",
    ),
  ]);
  doc.buttonRow([pick(ctx.catalog.calendar.back, "meeting.conflict.slots", { taskId: input.taskId })]);
  const built = doc.build();
  return { kind: "rich_html", html: built.html, actions: built.actions, keyboard: null };
}
