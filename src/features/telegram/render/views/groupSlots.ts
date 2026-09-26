import type { Slot, Task } from "../../domain";
import { actionButton } from "../buttons";
import { fill } from "../catalog";
import { RenderError } from "../errors";
import { formatDayLabel } from "../dayLabel";
import { formatClock } from "../format";
import { lines, text } from "../html";
import { row } from "../keyboard";
import type { RenderedMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import type { ViewContext } from "./context";
import { NAME_MAX_LENGTH, compactKeyboard, slotBullets, slotPickButtons, titleHtml, userLine } from "./shared";

export type GroupSlotsInput = {
  readonly task: Pick<Task, "id" | "title">;
  /** 1-3 windows found for the invoking user only. */
  readonly slots: readonly Slot[];
  /** Title of the group the request came from, if it may be mentioned. */
  readonly groupTitle: string | null;
};

/**
 * Scenario C result card: the windows found for the user who invoked the bot
 * in a group. It is a PRIVATE message (the group only gets `groupPointer`),
 * so it may show real free time.
 */
export function groupSlotsView(input: GroupSlotsInput, ctx: ViewContext): RenderedMessage {
  const { slots } = input;
  if (slots.length === 0) throw new RenderError("A windows card needs at least one slot");
  const { group, common } = ctx.catalog;
  const found = group.found[slots.length - 1];
  if (found === undefined) throw new RenderError("A card offers at most 3 slots");

  const adds = slotPickButtons(input.task.id, slots, (slot) =>
    group.add(formatDayLabel(slot.start, ctx.timezone, ctx.now, ctx.catalog.time), formatClock(slot.start, ctx.timezone)),
  );
  const otherTime = actionButton(common.otherTime, "slot.other", { taskId: input.task.id });

  return renderMessage({
    title: titleHtml(input.task.title),
    body: lines(text(found), slotBullets(slots, ctx)),
    footer:
      input.groupTitle === null
        ? undefined
        : fill(group.fromGroup, { group: userLine(input.groupTitle, NAME_MAX_LENGTH) }),
    keyboard: compactKeyboard([row(...adds), row(otherTime)]),
  });
}
