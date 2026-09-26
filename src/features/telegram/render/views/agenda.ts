import { MS_PER_MINUTE, parseInstant, toZonedParts } from "../../domain";
import type { Slot } from "../../domain";
import { fillPlain } from "../catalog";
import { capitalizeFirst } from "../dayLabel";
import { RenderError } from "../errors";
import { RANGE_DASH, formatClock, formatDuration, instantToUnixSeconds } from "../format";
import { RICH_LIMIT, utf8Length } from "../limits";
import { escapeMarkdown, timeLink } from "../markdown";
import type { RenderedRichMessage } from "../rendered";
import { renderRichMarkdown } from "../renderRichMarkdown";
import { weekdayName, yearUnlessCurrent } from "../timeWords";
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
 * Blocks per message. Two limits sit behind this number: the 32768 limit
 * (enforced in bytes, see `RICH_LIMIT`) is also respected by the size-based
 * splitting below, and the limit of 500 blocks per rich message, where a table
 * row, its cells and a task-list item may each count. 40 blocks stay far
 * below it.
 */
export const AGENDA_MAX_BLOCKS_PER_PAGE = 40;

/** Room kept for the page heading, the summary and the folded list wrapper. */
const PAGE_OVERHEAD_BYTES = 512;
/** Room kept for a day heading and the table header of one segment. */
const SEGMENT_OVERHEAD_BYTES = 256;
const PAGE_BYTE_BUDGET = RICH_LIMIT - PAGE_OVERHEAD_BYTES;
const DONE_MARK = "✅ ";
const TABLE_ALIGNMENT = "|:--|:--|";

/** One block as Markdown: its table row and its task-list item. */
type Entry = {
  readonly block: AgendaBlock;
  readonly row: string;
  readonly item: string;
  /** UTF-8 bytes of the row and the item with their line breaks. */
  readonly bytes: number;
};

type Segment = {
  readonly blocks: readonly AgendaBlock[];
  /** Day heading and table. */
  readonly markdown: string;
  /** Task-list items of the day's blocks. */
  readonly statusItems: readonly string[];
};

function timeCell(slot: Slot, ctx: ViewContext): string {
  const start = timeLink(instantToUnixSeconds(slot.start), "t", formatClock(slot.start, ctx.timezone));
  const end = timeLink(instantToUnixSeconds(slot.end), "t", formatClock(slot.end, ctx.timezone));
  return `${start}${RANGE_DASH}${end}`;
}

function entryOf(block: AgendaBlock, ctx: ViewContext): Entry {
  const title = escapeMarkdown(truncatePlain(oneLine(block.title), TITLE_MAX_LENGTH));
  const done = block.status === "done";
  const row = `| ${timeCell(block.slot, ctx)} | ${done ? DONE_MARK : ""}${title} |`;
  const item = `- [${done ? "x" : " "}] ${title}`;
  return { block, row, item, bytes: utf8Length(row) + utf8Length(item) + 2 };
}

function dayHeading(instant: string, continued: boolean, ctx: ViewContext): string {
  const words = ctx.catalog.time;
  const parts = toZonedParts(instant, ctx.timezone);
  const year = yearUnlessCurrent(parts.year, toZonedParts(ctx.now, ctx.timezone).year);
  const date = words.date(parts.day, words.monthsShort[parts.month - 1], year);
  const day = `${capitalizeFirst(weekdayName(words, parts.isoWeekday))}, ${date}`;
  return `## ${continued ? fillPlain(ctx.catalog.agenda.dayContinued, { day }) : day}`;
}

function segmentOf(entries: readonly Entry[], continued: boolean, ctx: ViewContext): Segment {
  const { agenda } = ctx.catalog;
  const first = entries[0];
  if (first === undefined) throw new RenderError("A day segment needs at least one block");
  const table = [
    `| ${agenda.timeColumn} | ${agenda.blockColumn} |`,
    TABLE_ALIGNMENT,
    ...entries.map((entry) => entry.row),
  ].join("\n");
  return {
    blocks: entries.map((entry) => entry.block),
    markdown: `${dayHeading(first.block.slot.start, continued, ctx)}\n\n${table}`,
    statusItems: entries.map((entry) => entry.item),
  };
}

function localDay(instant: string, ctx: ViewContext): string {
  const { year, month, day } = toZonedParts(instant, ctx.timezone);
  return `${year}-${month}-${day}`;
}

function byStart(a: AgendaBlock, b: AgendaBlock): number {
  return parseInstant(a.slot.start) - parseInstant(b.slot.start) || parseInstant(a.slot.end) - parseInstant(b.slot.end);
}

/** Splits one day's entries so each chunk fits a page by block count AND by bytes. */
function chunkDay(entries: readonly Entry[]): Entry[][] {
  const chunks: Entry[][] = [];
  let current: Entry[] = [];
  let bytes = SEGMENT_OVERHEAD_BYTES;
  for (const entry of entries) {
    const full = current.length >= AGENDA_MAX_BLOCKS_PER_PAGE || bytes + entry.bytes > PAGE_BYTE_BUDGET;
    if (full && current.length > 0) {
      chunks.push(current);
      current = [];
      bytes = SEGMENT_OVERHEAD_BYTES;
    }
    current.push(entry);
    bytes += entry.bytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** One segment per local day (by start time); a crowded day becomes several. */
function segmentsOf(blocks: readonly AgendaBlock[], ctx: ViewContext): Segment[] {
  const days = new Map<string, Entry[]>();
  for (const block of [...blocks].sort(byStart)) {
    const key = localDay(block.slot.start, ctx);
    days.set(key, [...(days.get(key) ?? []), entryOf(block, ctx)]);
  }
  return [...days.values()].flatMap((entries) =>
    chunkDay(entries).map((chunk, index) => segmentOf(chunk, index > 0, ctx)),
  );
}

function sizeOf(segment: Segment): number {
  const items = segment.statusItems.reduce((sum, item) => sum + utf8Length(item) + 1, 0);
  return utf8Length(segment.markdown) + items;
}

/** Fills pages in order; a segment that would not fit starts the next page. */
function packPages(segments: readonly Segment[]): Segment[][] {
  const pages: Segment[][] = [];
  let current: Segment[] = [];
  let blocks = 0;
  let size = 0;
  for (const segment of segments) {
    const segmentSize = sizeOf(segment);
    const fits =
      blocks + segment.blocks.length <= AGENDA_MAX_BLOCKS_PER_PAGE && size + segmentSize <= PAGE_BYTE_BUDGET;
    if (!fits && current.length > 0) {
      pages.push(current);
      current = [];
      blocks = 0;
      size = 0;
    }
    current.push(segment);
    blocks += segment.blocks.length;
    size += segmentSize;
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
