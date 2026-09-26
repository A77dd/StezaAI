import type { Instant, Slot } from "../../domain";
import { fill, fillPlain } from "../catalog";
import { RenderError } from "../errors";
import { formatSlotRange, slotHtml } from "../format";
import { join, text } from "../html";
import type { Html } from "../htmlType";
import { formatMoment, momentHtml } from "../moment";
import type { RenderedTextMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import type { ViewContext } from "./context";
import { NAME_MAX_LENGTH, TITLE_MAX_LENGTH, oneLine, slotBullets, titleHtml, truncatePlain, userLine } from "./shared";

/**
 * Cards for inline mode: the text that lands in a chat when the user picks a
 * result (`InputTextMessageContent`), plus the plain title and description of
 * the result row. They are shared with other people, so they show times only
 * (as `tg-time` tags, in each reader's own timezone) and never a keyboard.
 */
export type InlineCard = {
  /** Plain title of the result row. */
  readonly title: string;
  /** Plain second line of the result row. */
  readonly description: string;
  readonly message: RenderedTextMessage;
};

/** Windows an inline result lists; more would only push the answer down. */
export const INLINE_MAX_SLOTS = 5;
/** Participants named on an event card; the rest are counted. */
export const INLINE_MAX_PARTICIPANTS = 5;

const DESCRIPTION_SEPARATOR = "; ";

function plainTitle(template: string, title: string): string {
  return fillPlain(template, { title: truncatePlain(oneLine(title), TITLE_MAX_LENGTH) });
}

export type SlotListInput = { readonly slots: readonly Slot[] };

export function slotListCard(input: SlotListInput, ctx: ViewContext): InlineCard {
  if (input.slots.length > INLINE_MAX_SLOTS) {
    throw new RenderError(`An inline result lists at most ${INLINE_MAX_SLOTS} windows`);
  }
  const { inline } = ctx.catalog;
  const empty = input.slots.length === 0;
  return {
    title: inline.slotsTitle,
    description: empty
      ? inline.noSlots
      : input.slots.map((slot) => formatSlotRange(slot, ctx.timezone, ctx.catalog.time)).join(DESCRIPTION_SEPARATOR),
    message: renderMessage({
      title: text(inline.slotsTitle),
      body: empty ? text(inline.noSlots) : slotBullets(input.slots, ctx),
    }),
  };
}

export type EventCardInput = {
  readonly title: string;
  readonly slot: Slot;
  readonly participants: readonly string[];
};

function participantsHtml(names: readonly string[], ctx: ViewContext): Html {
  const shown = names.slice(0, INLINE_MAX_PARTICIPANTS).map((name) => userLine(name, NAME_MAX_LENGTH));
  const rest = names.length - shown.length;
  const list = join(shown, text(", "));
  return rest > 0 ? join([list, text(` ${ctx.catalog.inline.andMore(rest)}`)]) : list;
}

export function eventCard(input: EventCardInput, ctx: ViewContext): InlineCard {
  const { inline } = ctx.catalog;
  const facts = [{ label: text(inline.when), value: slotHtml(input.slot, ctx.timezone, ctx.catalog.time) }];
  if (input.participants.length > 0) {
    facts.push({ label: text(inline.withWho), value: participantsHtml(input.participants, ctx) });
  }
  return {
    title: plainTitle(inline.eventTitle, input.title),
    description: formatSlotRange(input.slot, ctx.timezone, ctx.catalog.time),
    message: renderMessage({ title: fill(inline.eventTitle, { title: titleHtml(input.title) }), facts }),
  };
}

export type ReminderCardInput = { readonly title: string; readonly at: Instant };

export function reminderCard(input: ReminderCardInput, ctx: ViewContext): InlineCard {
  const { inline } = ctx.catalog;
  return {
    title: plainTitle(inline.reminderTitle, input.title),
    description: formatMoment(input.at, ctx.timezone, ctx.catalog.time),
    message: renderMessage({
      title: fill(inline.reminderTitle, { title: titleHtml(input.title) }),
      facts: [{ label: text(inline.when), value: momentHtml(input.at, ctx.timezone, ctx.catalog.time) }],
    }),
  };
}
