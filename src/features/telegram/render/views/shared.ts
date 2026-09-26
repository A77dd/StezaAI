import type { Slot, Task } from "../../domain";
import type { ButtonRow, ButtonSpec, KeyboardSpec } from "../buttonSpec";
import { actionButton, switchInlineButton, webAppButton } from "../buttons";
import { fill } from "../catalog";
import { RenderError } from "../errors";
import { formatDayLabel } from "../dayLabel";
import { formatClock, formatDeadline, formatDuration, slotHtml } from "../format";
import { join, lines, text } from "../html";
import type { Html } from "../htmlType";
import { keyboard } from "../keyboard";
import { miniAppLink } from "../links";
import type { MessageView } from "../messageView";
import { truncateHtml } from "../truncate";
import type { ViewContext } from "./context";

/**
 * Helpers shared by the views. User text is always treated the same way:
 * whitespace is collapsed, it is escaped, and it is cut EXPLICITLY at a
 * documented length, so no view can overflow the 4096-character limit
 * through a long title or name.
 */

/** Visible characters of a task or event title in any message. */
export const TITLE_MAX_LENGTH = 120;
/** Visible characters of a forwarded or quoted source message. */
export const SOURCE_PREVIEW_MAX_LENGTH = 300;
/** Visible characters of a person's or a group's name. */
export const NAME_MAX_LENGTH = 40;

/** Telegram inline keyboards offer at most this many proposed slots (`slot.pick` indexes 0-2). */
export const MAX_SLOTS = 3;

const ELLIPSIS = "…";

/** One line of text: runs of whitespace (and newlines) become one space. Empty text is a bug upstream. */
export function oneLine(value: string): string {
  const line = value.replace(/\s+/g, " ").trim();
  if (line === "") throw new RenderError("Text to show must not be empty");
  return line;
}

/** Plain-text shortening for places that are not HTML (button labels, copy text, Markdown). */
export function truncatePlain(value: string, max: number): string {
  const characters = Array.from(value);
  return characters.length <= max ? value : `${characters.slice(0, max - 1).join("")}${ELLIPSIS}`;
}

/** Escaped, single-line, shortened user text. */
export function userLine(value: string, max: number): Html {
  return truncateHtml(text(oneLine(value)), max);
}

export function titleHtml(title: string): Html {
  return userLine(title, TITLE_MAX_LENGTH);
}

export function quoted(ctx: ViewContext, inner: Html): Html {
  return fill(ctx.catalog.common.quoted, { text: inner });
}

const BULLET = text("• ");

export function bulletList(items: readonly Html[]): Html {
  return lines(...items.map((item) => join([BULLET, item])));
}

export function assertSlotCount(slots: readonly Slot[]): void {
  if (slots.length > MAX_SLOTS) throw new RenderError(`A card offers at most ${MAX_SLOTS} slots`);
}

/** `slot.pick` carries the position of the slot the card showed. */
export function slotIndex(index: number): 0 | 1 | 2 {
  if (index === 0 || index === 1 || index === 2) return index;
  throw new RenderError(`A card offers at most ${MAX_SLOTS} slots`);
}

export function slotBullets(slots: readonly Slot[], ctx: ViewContext): Html {
  return bulletList(slots.map((slot) => slotHtml(slot, ctx.timezone, ctx.catalog.time)));
}

/** `Завтра 16:30`, `Чт 11:00`: relative day and start time, the label of a slot button. */
export function slotStartLabel(slot: Slot, ctx: ViewContext): string {
  const day = formatDayLabel(slot.start, ctx.timezone, ctx.now, ctx.catalog.time);
  return `${day} ${formatClock(slot.start, ctx.timezone)}`;
}

/** One `slot.pick` button per slot; the first, recommended one is blue. */
export function slotPickButtons(
  taskId: string,
  slots: readonly Slot[],
  label: (slot: Slot) => string,
): ButtonSpec[] {
  assertSlotCount(slots);
  return slots.map((slot, index) =>
    actionButton(
      label(slot),
      "slot.pick",
      { taskId, slotIndex: slotIndex(index) },
      index === 0 ? "primary" : undefined,
    ),
  );
}

type Fact = NonNullable<MessageView["facts"]>[number];

/** Deadline and estimate of a task, each only when known. */
export function taskFacts(
  task: Pick<Task, "deadline" | "durationMinutes">,
  ctx: ViewContext,
): Fact[] {
  const facts: Fact[] = [];
  if (task.deadline !== null) {
    const deadline = formatDeadline(task.deadline, ctx.timezone, ctx.now, ctx.catalog.time);
    facts.push({ label: text(ctx.catalog.task.deadline), value: text(deadline) });
  }
  if (task.durationMinutes !== null) {
    const estimate = formatDuration(task.durationMinutes, ctx.catalog.time);
    facts.push({ label: text(ctx.catalog.task.estimate), value: text(estimate) });
  }
  return facts;
}

/** Keyboard of the rows that are present; a null row (an optional button) is left out. */
export function compactKeyboard(candidates: ReadonlyArray<ButtonRow | null>): KeyboardSpec {
  return keyboard(...candidates.filter((row): row is ButtonRow => row !== null));
}

/** Types the sample inline query into the input field: the way to try inline mode. */
export function tryInlineButton(ctx: ViewContext): ButtonSpec {
  return switchInlineButton(ctx.catalog.common.tryInline, ctx.catalog.common.tryInlineQuery, "current_chat");
}

/** Opens the Mini App (optionally at `path`), or null when no Mini App is configured. */
export function miniAppButton(ctx: ViewContext, label: string, path?: string): ButtonSpec | null {
  return ctx.miniAppUrl === null ? null : webAppButton(label, miniAppLink(ctx.miniAppUrl, path));
}

/** Rows of `size` buttons; the last row may be shorter. */
export function chunkRows(buttons: readonly ButtonSpec[], size: number): ButtonRow[] {
  const rows: ButtonRow[] = [];
  for (let start = 0; start < buttons.length; start += size) rows.push(buttons.slice(start, start + size));
  return rows;
}
