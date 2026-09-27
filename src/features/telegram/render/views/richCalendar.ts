import type { Slot, Task } from "../../domain";
import { toZonedParts } from "../../domain";
import { actionButton } from "../buttons";
import { formatSlotRange } from "../format";
import { createRichDocument, disabledCell, type RichCell } from "../rich";
import type { ActionButtonSpec } from "../buttonSpec";
import type { RenderedRichHtmlMessage } from "../rendered";
import type { ViewContext } from "./context";

/**
 * The proposal card as an interactive Rich Message (Bot API 10.3): a
 * mini-calendar inside the message body. Days that carry a proposed slot are
 * live callback buttons; the rest are disabled. Picking a day re-renders the
 * same message with that day's slots as booking buttons (the regular
 * `slot.pick` flow), and month navigation moves within the months the slots
 * actually span. Every re-render issues fresh callback tokens, so stale
 * buttons fail the way the callback codec always fails: visibly.
 */

export type CalendarMonthView = { readonly year: number; readonly month: number };
export type CalendarDayView = { readonly year: number; readonly month: number; readonly day: number };

export type CalendarInput = {
  readonly task: Task;
  readonly slots: readonly Slot[];
};

const MONTHS_PER_YEAR = 12;
const DAYS_PER_WEEK = 7;

/**
 * A validated callback button for a rich row. The generic action/payload
 * correlation cannot cross this helper (same situation as `bindKeyboard`'s
 * `issue` cast); `validateButton` and the callback registry re-validate the
 * pair at runtime.
 */
function pick(
  label: string,
  action: "calendar.day" | "calendar.month" | "slot.pick" | "task.edit" | "slot.other",
  payload: Record<string, unknown>,
  style?: "primary" | "success" | "danger",
): RichCell {
  return {
    kind: "action",
    button: actionButton(label, action as never, payload as never, style) as ActionButtonSpec,
  };
}

type Month = { readonly year: number; readonly month: number };

const monthKey = ({ year, month }: Month): number => year * MONTHS_PER_YEAR + (month - 1);

function shiftMonth({ year, month }: Month, delta: number): Month {
  const total = year * MONTHS_PER_YEAR + (month - 1) + delta;
  return { year: Math.floor(total / MONTHS_PER_YEAR), month: (total % MONTHS_PER_YEAR) + 1 };
}

function slotDay(slot: Slot, timezone: string): { year: number; month: number; day: number } {
  const parts = toZonedParts(slot.start, timezone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

/** The month of the first slot: the calendar opens there. */
export function initialCalendarMonth(slots: readonly Slot[], timezone: string): CalendarMonthView {
  if (slots.length === 0) throw new Error("richCalendar: a proposal without slots has no calendar");
  const first = slotDay(slots[0]!, timezone);
  return { year: first.year, month: first.month };
}

function slotIndexesByDay(
  input: CalendarInput,
  timezone: string,
  view: CalendarMonthView,
): Map<number, number[]> {
  const byDay = new Map<number, number[]>();
  for (const [index, slot] of input.slots.entries()) {
    const day = slotDay(slot, timezone);
    if (day.year !== view.year || day.month !== view.month) continue;
    const list = byDay.get(day.day) ?? [];
    list.push(index);
    byDay.set(day.day, list);
  }
  return byDay;
}

function appendCalendar(
  doc: ReturnType<typeof createRichDocument>,
  input: CalendarInput,
  view: CalendarMonthView,
  ctx: ViewContext,
  selectedDay: number | undefined,
): void {
  const time = ctx.catalog.time;
  doc.heading(input.task.title);
  doc.line(`${time.monthsShort[view.month - 1]} ${view.year}`);

  // Weekday header, Monday first (matches `isoWeekday`).
  doc.buttonRow(time.weekdaysShort.map((label) => disabledCell(label)));

  const byDay = slotIndexesByDay(input, ctx.timezone, view);
  const firstWeekday = new Date(Date.UTC(view.year, view.month - 1, 1)).getUTCDay() || DAYS_PER_WEEK;
  const daysInMonth = new Date(Date.UTC(view.year, view.month, 0)).getUTCDate();

  for (let rowStart = 1 - (firstWeekday - 1); rowStart <= daysInMonth; rowStart += DAYS_PER_WEEK) {
    const cells: RichCell[] = [];
    for (let cell = 0; cell < DAYS_PER_WEEK; cell += 1) {
      const day = rowStart + cell;
      if (day < 1 || day > daysInMonth) {
        cells.push(disabledCell("·"));
        continue;
      }
      const indexes = byDay.get(day);
      if (indexes === undefined) {
        cells.push(disabledCell(String(day)));
        continue;
      }
      cells.push(
        // A day may hold several slots: the label shows how many.
        pick(
          indexes.length === 1 ? String(day) : `${day} (${indexes.length})`,
          "calendar.day",
          { taskId: input.task.id, year: view.year, month: view.month, day },
          day === selectedDay ? "success" : "primary",
        ),
      );
    }
    doc.buttonRow(cells);
  }

  // Month navigation stays within the months the slots actually span.
  const months = input.slots.map((slot) => {
    const day = slotDay(slot, ctx.timezone);
    return monthKey({ year: day.year, month: day.month });
  });
  const min = Math.min(...months);
  const max = Math.max(...months);
  const current = monthKey(view);
  const nav: RichCell[] = [];
  if (current - 1 >= min) {
    const target = shiftMonth(view, -1);
    nav.push(pick("‹", "calendar.month", { taskId: input.task.id, ...target }));
  } else {
    nav.push(disabledCell("‹"));
  }
  nav.push(disabledCell("·"));
  if (current + 1 <= max) {
    const target = shiftMonth(view, +1);
    nav.push(pick("›", "calendar.month", { taskId: input.task.id, ...target }));
  } else {
    nav.push(disabledCell("›"));
  }
  doc.buttonRow(nav);
}

/** Month grid: days with slots are tappable, a nav row moves between months. */
export function richCalendarMonthView(
  input: CalendarInput,
  view: CalendarMonthView,
  ctx: ViewContext,
): RenderedRichHtmlMessage {
  const doc = createRichDocument();
  appendCalendar(doc, input, view, ctx, undefined);
  doc.buttonRow([
    pick(ctx.catalog.common.edit, "task.edit", { taskId: input.task.id }),
    pick(ctx.catalog.common.otherTime, "slot.other", { taskId: input.task.id }),
  ]);
  const built = doc.build();
  return { kind: "rich_html", html: built.html, actions: built.actions, keyboard: null };
}

/** Day picked: the grid highlights it and the day's slots become book buttons. */
export function richCalendarDayView(
  input: CalendarInput,
  view: CalendarDayView,
  ctx: ViewContext,
): RenderedRichHtmlMessage {
  const doc = createRichDocument();
  appendCalendar(doc, input, { year: view.year, month: view.month }, ctx, view.day);

  const time = ctx.catalog.time;
  const daySlots = input.slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => {
      const day = slotDay(slot, ctx.timezone);
      return day.year === view.year && day.month === view.month && day.day === view.day;
    });
  for (const { slot, index } of daySlots) {
    doc.buttonRow([
      pick(
        formatSlotRange(slot, ctx.timezone, time),
        "slot.pick",
        { taskId: input.task.id, slotIndex: index as 0 | 1 | 2, slotStart: slot.start, slotEnd: slot.end },
        "success",
      ),
    ]);
  }
  doc.buttonRow([
    pick(ctx.catalog.calendar.back, "calendar.month", {
      taskId: input.task.id,
      year: view.year,
      month: view.month,
    }),
  ]);
  const built = doc.build();
  return { kind: "rich_html", html: built.html, actions: built.actions, keyboard: null };
}

/** The booked state of a rich calendar card, re-rendered in place. */
export function richBookedView(
  input: { readonly task: Task; readonly slot: Slot },
  ctx: ViewContext,
): RenderedRichHtmlMessage {
  const doc = createRichDocument();
  doc.heading(input.task.title);
  doc.line(formatSlotRange(input.slot, ctx.timezone, ctx.catalog.time));
  doc.buttonRow([disabledCell(ctx.catalog.task.booked)]);
  const built = doc.build();
  return { kind: "rich_html", html: built.html, actions: built.actions, keyboard: null };
}
