import { describe, expect, it } from "vitest";
import { makeEnViewContext, makeViewContext, slotAt, TODAY_SLOT, TOMORROW_SLOT } from "../../testing/viewFixtures";
import { RICH_LIMIT, utf8Length } from "../limits";
import { AGENDA_MAX_BLOCKS_PER_PAGE, paginateAgenda } from "./agenda";
import type { AgendaBlock } from "./agenda";

const ctx = makeViewContext();

const week: AgendaBlock[] = [
  { title: "Подготовить презентацию", slot: TODAY_SLOT, status: "scheduled" },
  { title: "Созвон по бюджету", slot: TOMORROW_SLOT, status: "done" },
  { title: "Обед с Аней | друзья", slot: slotAt("2026-09-24T11:00:00.000Z", 30), status: "scheduled" },
];

describe("paginateAgenda", () => {
  it("renders a week as one rich message: a table per day, statuses in a folded task list", () => {
    const pages = paginateAgenda({ scope: "week", blocks: week }, ctx);

    expect(pages).toEqual([
      {
        kind: "rich",
        markdown:
          "# Неделя\n\n" +
          "3 блока · 2 ч 30 мин\n\n" +
          "## Ср, 23 сент.\n\n" +
          "| Время | Блок |\n" +
          "|:--|:--|\n" +
          "| ![16:00](tg://time?unix=1790168400&format=t)–![17:00](tg://time?unix=1790172000&format=t) | Подготовить презентацию |\n\n" +
          "## Чт, 24 сент.\n\n" +
          "| Время | Блок |\n" +
          "|:--|:--|\n" +
          "| ![10:00](tg://time?unix=1790233200&format=t)–![11:00](tg://time?unix=1790236800&format=t) | ✅ Созвон по бюджету |\n" +
          "| ![14:00](tg://time?unix=1790247600&format=t)–![14:30](tg://time?unix=1790249400&format=t) | Обед с Аней \\| друзья |\n\n" +
          "<details>\n" +
          "<summary>Статусы: 1 из 3 готово</summary>\n\n" +
          "- [ ] Подготовить презентацию\n" +
          "- [x] Созвон по бюджету\n" +
          "- [ ] Обед с Аней \\| друзья\n\n" +
          "</details>",
        keyboard: null,
      },
    ]);
  });

  it("renders today", () => {
    const [page] = paginateAgenda({ scope: "today", blocks: [week[0] as AgendaBlock] }, ctx);

    expect(page?.markdown.startsWith("# Сегодня\n\n1 блок · 1 ч\n\n## Ср, 23 сент.\n\n")).toBe(true);
  });

  it("says so when there is nothing to show", () => {
    expect(paginateAgenda({ scope: "today", blocks: [] }, ctx)).toEqual([
      { kind: "rich", markdown: "# Сегодня\n\nНа сегодня блоков нет — день свободен.", keyboard: null },
    ]);
    expect(paginateAgenda({ scope: "week", blocks: [] }, ctx)[0]?.markdown).toBe(
      "# Неделя\n\nНа этой неделе блоков нет.",
    );
  });

  it("sorts blocks and groups them by the local day they start", () => {
    const late = { title: "Поздно", slot: slotAt("2026-09-23T20:30:00.000Z", 60), status: "scheduled" } as const; // 23:30 Moscow
    const early = { title: "Рано", slot: slotAt("2026-09-23T21:30:00.000Z", 30), status: "scheduled" } as const; // 00:30 next day
    const [page] = paginateAgenda({ scope: "week", blocks: [early, late] }, ctx);
    const markdown = page?.markdown ?? "";

    expect(markdown.indexOf("## Ср, 23 сент.")).toBeLessThan(markdown.indexOf("Поздно"));
    expect(markdown.indexOf("Поздно")).toBeLessThan(markdown.indexOf("## Чт, 24 сент."));
    expect(markdown.indexOf("## Чт, 24 сент.")).toBeLessThan(markdown.indexOf("Рано"));
  });

  it("shows the year of a day in another year", () => {
    const block = { title: "Новый год", slot: slotAt("2027-01-05T09:00:00.000Z"), status: "scheduled" } as const;

    expect(paginateAgenda({ scope: "week", blocks: [block] }, ctx)[0]?.markdown).toContain("## Вт, 5 янв. 2027");
  });

  it("speaks English", () => {
    const [page] = paginateAgenda({ scope: "week", blocks: week }, makeEnViewContext());

    expect(page?.markdown.startsWith("# Week\n\n3 blocks · 2 h 30 min\n\n## Wed, Sep 23\n\n| Time | Block |")).toBe(true);
    expect(page?.markdown).toContain("<summary>Status: 1 of 3 done</summary>");
  });
});

describe("paginateAgenda: user text", () => {
  it("escapes Markdown and HTML in titles and shortens long ones", () => {
    const title = "`x` <details>![a](tg://user?id=1)</details> # **b** " + "я".repeat(200);
    const [page] = paginateAgenda({ scope: "week", blocks: [{ title, slot: TODAY_SLOT, status: "scheduled" }] }, ctx);
    const markdown = page?.markdown ?? "";

    expect(markdown).toContain("\\`x\\` \\<details\\>\\!\\[a\\]\\(tg://user?id\\=1\\)\\</details\\> \\# \\*\\*b\\*\\* я");
    expect(markdown).toMatch(/я+…/);
    expect(markdown.match(/<details>/g)).toHaveLength(1);
  });

  it("keeps a multi-line title on one table row", () => {
    const [page] = paginateAgenda({ scope: "week", blocks: [{ title: "a\n\n| b", slot: TODAY_SLOT, status: "scheduled" }] }, ctx);

    expect(page?.markdown).toContain("| a \\| b |");
  });
});

describe("paginateAgenda: pagination", () => {
  const dayBlocks = (days: number): AgendaBlock[] =>
    Array.from({ length: days }, (_unused, day) => ({
      title: `Задача ${day + 1}`,
      slot: slotAt(new Date(Date.UTC(2026, 9, 1 + day, 7)).toISOString()),
      status: "scheduled" as const,
    }));

  it("splits by whole days and never loses a block", () => {
    const pages = paginateAgenda({ scope: "week", blocks: dayBlocks(45) }, ctx);

    expect(AGENDA_MAX_BLOCKS_PER_PAGE).toBe(40);
    expect(pages).toHaveLength(2);
    expect(pages[0]?.markdown.startsWith("# Неделя (1/2)\n\n45 блоков · 45 ч\n\n## ")).toBe(true);
    expect(pages[1]?.markdown.startsWith("# Неделя (2/2)\n\n## ")).toBe(true);
    const titles = pages.flatMap((page) => [...page.markdown.matchAll(/\| Задача (\d+) \|/g)].map((match) => Number(match[1])));
    expect(titles).toEqual(Array.from({ length: 45 }, (_unused, index) => index + 1));
  });

  it("carries a crowded day over to the next page under a continued heading", () => {
    const crowded = Array.from({ length: 100 }, (_unused, index) => ({
      title: `Дело ${index + 1}`,
      slot: slotAt(new Date(Date.UTC(2026, 9, 1, 0, index * 10)).toISOString(), 10),
      status: "scheduled" as const,
    }));
    const pages = paginateAgenda({ scope: "today", blocks: crowded }, ctx);

    expect(pages).toHaveLength(3);
    expect(pages[0]?.markdown).toContain("## Чт, 1 окт.\n");
    expect(pages[1]?.markdown).toContain("## Чт, 1 окт. (продолжение)\n");
    expect(pages[2]?.markdown).toContain("## Чт, 1 окт. (продолжение)\n");
    expect(pages.map((page) => (page.markdown.match(/^\| !\[/gm) ?? []).length)).toEqual([40, 40, 20]);
  });

  it("stays under the Rich Markdown limit with the worst-case titles", () => {
    const title = "<".repeat(200);
    const blocks = Array.from({ length: AGENDA_MAX_BLOCKS_PER_PAGE * 3 }, (_unused, index) => ({
      title,
      slot: slotAt(new Date(Date.UTC(2026, 9, 1 + Math.floor(index / 40), 0, (index % 40) * 30)).toISOString(), 30),
      status: index % 2 === 0 ? ("done" as const) : ("scheduled" as const),
    }));
    const pages = paginateAgenda({ scope: "week", blocks }, ctx);

    expect(pages.length).toBeGreaterThanOrEqual(3);
    for (const page of pages) expect(utf8Length(page.markdown)).toBeLessThanOrEqual(RICH_LIMIT);
  });

  it.each([
    ["emoji", "😀".repeat(200)],
    ["CJK", "漢".repeat(200)],
    ["escaped CJK", "漢<".repeat(100)],
  ])("stays under the limit in BYTES with 120-character %s titles, on one crowded day", (_kind, title) => {
    const blocks = Array.from({ length: 100 }, (_unused, index) => ({
      title: `${index}${title}`,
      slot: slotAt(new Date(Date.UTC(2026, 9, 1, 0, index * 10)).toISOString(), 10),
      status: index % 2 === 0 ? ("done" as const) : ("scheduled" as const),
    }));
    const pages = paginateAgenda({ scope: "today", blocks }, ctx);

    expect(pages.length).toBeGreaterThanOrEqual(3);
    for (const page of pages) expect(utf8Length(page.markdown)).toBeLessThanOrEqual(RICH_LIMIT);
    const rows = pages.reduce((sum, page) => sum + (page.markdown.match(/^\| !\[/gm) ?? []).length, 0);
    expect(rows).toBe(100);
  });
});
