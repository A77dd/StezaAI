import { MS_PER_MINUTE, parseInstant, toZonedParts } from "../../domain";
import type { Slot } from "../../domain";
import { fillPlain } from "../catalog";
import { capitalizeFirst } from "../dayLabel";
import { RenderError } from "../errors";
import { formatClock, formatDuration } from "../format";
import { RICH_LIMIT } from "../limits";
import { escapeMarkdown, timeLink } from "../markdown";
import type { RenderedRichMessage } from "../rendered";
import { renderRichMarkdown } from "../renderRichMarkdown";
import type { ViewContext } from "./context";
import { TITLE_MAX_LENGTH, oneLine, truncatePlain } from "./shared";

/** One booked block of the agenda. `status` says whether it is still ahead or already done. */
export type AgendaBlock = {
  readonly title: string;
  readonly slot: Slot;
  readonly status: "scheduled" | "done";
};

export type AgendaInput = {
  readonly scope: "today" | "week";
  readonly blocks: readonly AgendaBlock[];
};

/**
 * Blocks per message. Two limits sit behind this number: the 32768-character
 * text limit (a block is at most about 600 characters with a 120-character
 * title that escapes to twice its length), and the limit of 500 blocks per
 * rich message, where a table row, its cells and a task-list item may each
 * count. 40 blocks stay far below both.
 */
export const AGENDA_MAX_BLOCKS_PER_PAGE = 40;

/** Room kept for the page heading and the summary when packing pages by size. */
const HEADING_ALLOWANCE = 512;
const CHARACTER_BUDGET = RICH_LIMIT - HEADING_ALLOWANCE;
const DONE_MARK = "✅ ";
const TABLE_ALIGNMENT = "|:--|:--|";

type Segment = {
  readonly blocks: readonly AgendaBlock[];
  /** Day heading and table. */
  readonly markdown: string;
  /** Task-list items of the day's blocks. */
  readonly statusItems: readonly string[];
};

function unix(instant: string): number {
  return Math.floor(parseInstant(instant) / 1000);
}

function timeCell(slot: Slot, ctx: ViewContext): string {
  const start = timeLink(unix(slot.start), "t", formatClock(slot.start, ctx.timezone));
  const end = timeLink(unix(slot.end), "t", formatClock(slot.end, ctx.timezone));
  return `${start}–${end}`;
}

function blockTitle(block: AgendaBlock): string {
  return escapeMarkdown(truncatePlain(oneLine(block.title), TITLE_MAX_LENGTH));
}

function dayHeading(instant: string, continued: boolean, ctx: ViewContext): string {
  const words = ctx.catalog.time;
  const parts = toZonedParts(instant, ctx.timezone);
  const year = parts.year === toZonedParts(ctx.now, ctx.timezone).year ? null : parts.year;
  const day = `${capitalizeFirst(words.weekdaysShort[parts.isoWeekday - 1])}, ${words.date(parts.day, words.monthsShort[parts.month - 1], year)}`;
  return `## ${continued ? fillPlain(ctx.catalog.agenda.dayContinued, { day }) : day}`;
}

function segmentOf(blocks: readonly AgendaBlock[], continued: boolean, ctx: ViewContext): Segment {
  const { agenda } = ctx.catalog;
  const first = blocks[0];
  if (first === undefined) throw new RenderError("A day segment needs at least one block");
  const rows = blocks.map(
    (block) => `| ${timeCell(block.slot, ctx)} | ${block.status === "done" ? DONE_MARK : ""}${blockTitle(block)} |`,
  );
  const table = [`| ${agenda.timeColumn} | ${agenda.blockColumn} |`, TABLE_ALIGNMENT, ...rows].join("\n");
  return {
    blocks,
    markdown: `${dayHeading(first.slot.start, continued, ctx)}\n\n${table}`,
    statusItems: blocks.map((block) => `- [${block.status === "done" ? "x" : " "}] ${blockTitle(block)}`),
  };
}

function localDay(instant: string, ctx: ViewContext): string {
  const { year, month, day } = toZonedParts(instant, ctx.timezone);
  return `${year}-${month}-${day}`;
}

function byStart(a: AgendaBlock, b: AgendaBlock): number {
  return parseInstant(a.slot.start) - parseInstant(b.slot.start) || parseInstant(a.slot.end) - parseInstant(b.slot.end);
}

/** One segment per local day (by start time); a day with too many blocks becomes several. */
function segmentsOf(blocks: readonly AgendaBlock[], ctx: ViewContext): Segment[] {
  const days = new Map<string, AgendaBlock[]>();
  for (const block of [...blocks].sort(byStart)) {
    const key = localDay(block.slot.start, ctx);
    days.set(key, [...(days.get(key) ?? []), block]);
  }
  const segments: Segment[] = [];
  for (const dayBlocks of days.values()) {
    for (let start = 0; start < dayBlocks.length; start += AGENDA_MAX_BLOCKS_PER_PAGE) {
      const chunk = dayBlocks.slice(start, start + AGENDA_MAX_BLOCKS_PER_PAGE);
      segments.push(segmentOf(chunk, start > 0, ctx));
    }
  }
  return segments;
}

function sizeOf(segment: Segment): number {
  return segment.markdown.length + segment.statusItems.reduce((sum, item) => sum + item.length + 1, 0);
}

/** Fills pages in order; a segment that would not fit starts the next page. */
function packPages(segments: readonly Segment[]): Segment[][] {
  const pages: Segment[][] = [];
  let current: Segment[] = [];
  let blocks = 0;
  let size = 0;
  for (const segment of segments) {
    const fits =
      blocks + segment.blocks.length <= AGENDA_MAX_BLOCKS_PER_PAGE && size + sizeOf(segment) <= CHARACTER_BUDGET;
    if (!fits && current.length > 0) {
      pages.push(current);
      current = [];
      blocks = 0;
      size = 0;
    }
    current.push(segment);
    blocks += segment.blocks.length;
    size += sizeOf(segment);
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

function summaryLine(blocks: readonly AgendaBlock[], ctx: ViewContext): string {
  const minutes = blocks.reduce(
    (sum, { slot }) => sum + (parseInstant(slot.end) - parseInstant(slot.start)) / MS_PER_MINUTE,
    0,
  );
  return fillPlain(ctx.catalog.agenda.summary, {
    blocks: ctx.catalog.units.blocks(blocks.length),
    duration: formatDuration(Math.round(minutes), ctx.catalog.time),
  });
}

function statusDetails(segments: readonly Segment[], ctx: ViewContext): string {
  const blocks = segments.flatMap((segment) => segment.blocks);
  const done = blocks.filter((block) => block.status === "done").length;
  const summary = fillPlain(ctx.catalog.agenda.statuses, { done: String(done), total: String(blocks.length) });
  const items = segments.flatMap((segment) => segment.statusItems).join("\n");
  return `<details>\n<summary>${summary}</summary>\n\n${items}\n\n</details>`;
}

/**
 * The agenda for today or the week as Rich Markdown, split into pages by day.
 * Each page is a complete, valid message (send them one after another): a
 * heading, on the first page a summary, then per day a table of blocks with
 * `tg://time` date-time links, and a folded task list of statuses. Nothing is
 * cut: a crowded period becomes more pages, and a day with more than
 * `AGENDA_MAX_BLOCKS_PER_PAGE` blocks continues on the next page.
 */
export function paginateAgenda(input: AgendaInput, ctx: ViewContext): readonly RenderedRichMessage[] {
  const { agenda } = ctx.catalog;
  const heading = input.scope === "today" ? agenda.today : agenda.week;
  if (input.blocks.length === 0) {
    const empty = input.scope === "today" ? agenda.emptyToday : agenda.emptyWeek;
    return [renderRichMarkdown(`# ${heading}\n\n${empty}`)];
  }

  const pages = packPages(segmentsOf(input.blocks, ctx));
  return pages.map((segments, index) => {
    const title =
      pages.length === 1
        ? heading
        : fillPlain(agenda.paged, { title: heading, page: String(index + 1), pages: String(pages.length) });
    const parts = [`# ${title}`];
    if (index === 0) parts.push(summaryLine(input.blocks, ctx));
    parts.push(...segments.map((segment) => segment.markdown), statusDetails(segments, ctx));
    return renderRichMarkdown(parts.join("\n\n"));
  });
}
