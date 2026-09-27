import { describe, expect, it } from "vitest";
import { makeEnViewContext, makeViewContext, slotAt, TODAY_SLOT, TOMORROW_SLOT } from "../../testing/viewFixtures";
import { RenderError } from "../errors";
import { visibleLength } from "../limits";
import {
  MAX_SLOTS,
  oneLine,
  slotBullets,
  slotIndex,
  slotPickButtons,
  slotStartLabel,
  taskFacts,
  titleHtml,
  TITLE_MAX_LENGTH,
  truncatePlain,
  userLine,
} from "./shared";

const ctx = makeViewContext();

describe("oneLine", () => {
  it("collapses whitespace and newlines into single spaces", () => {
    expect(oneLine("  Позвонить \n\n  Ане\tзавтра ")).toBe("Позвонить Ане завтра");
  });

  it("rejects text that is empty after trimming, without echoing it", () => {
    expect(() => oneLine(" \n ")).toThrow(RenderError);
  });
});

describe("truncatePlain", () => {
  it("keeps short text and cuts long text at a code point with an ellipsis", () => {
    expect(truncatePlain("коротко", 10)).toBe("коротко");
    expect(truncatePlain("абвгдеёжз", 5)).toBe("абвг…");
    expect(truncatePlain("😀".repeat(6), 4)).toBe("😀😀😀…");
  });
});

describe("userLine and titleHtml", () => {
  it("escapes markup in user text", () => {
    expect(userLine("<b>Срочно</b> & </a>", 100)).toBe("&lt;b&gt;Срочно&lt;/b&gt; &amp; &lt;/a&gt;");
  });

  it("cuts long text to the visible limit on an entity boundary", () => {
    const html = titleHtml("&".repeat(500));

    expect(visibleLength(html)).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
    expect(html.endsWith("…")).toBe(true);
    expect(html).not.toMatch(/&(?!amp;)/);
  });

  it("leaves a short title alone", () => {
    expect(titleHtml("Подготовить презентацию")).toBe("Подготовить презентацию");
  });
});

describe("slots", () => {
  it("labels a slot button with the relative day and start time", () => {
    expect(slotStartLabel(TODAY_SLOT, ctx)).toBe("Сегодня 16:00");
    expect(slotStartLabel(TOMORROW_SLOT, ctx)).toBe("Завтра 10:00");
    expect(slotStartLabel(slotAt("2026-09-25T08:00:00.000Z"), ctx)).toBe("Пт 11:00");
    expect(slotStartLabel(TOMORROW_SLOT, makeEnViewContext())).toBe("Tomorrow 10:00");
  });

  it("lists slots as bullets with tg-time tags", () => {
    expect(slotBullets([TODAY_SLOT], ctx)).toBe(
      `• <tg-time unix="${Date.parse(TODAY_SLOT.start) / 1000}" format="wDt">ср, 16:00</tg-time>–` +
        `<tg-time unix="${Date.parse(TODAY_SLOT.end) / 1000}" format="t">17:00</tg-time>`,
    );
  });

  it("makes one slot.pick button per slot, all green confirmations", () => {
    const buttons = slotPickButtons("t1", [TODAY_SLOT, TOMORROW_SLOT], (slot) => slotStartLabel(slot, ctx));

    expect(buttons).toEqual([
      { kind: "action", text: "Сегодня 16:00", action: "slot.pick", payload: { taskId: "t1", slotIndex: 0 }, style: "success" },
      { kind: "action", text: "Завтра 10:00", action: "slot.pick", payload: { taskId: "t1", slotIndex: 1 }, style: "success" },
    ]);
  });

  it("uses each position as the slot index when equal slots repeat", () => {
    const buttons = slotPickButtons("t1", [TODAY_SLOT, TODAY_SLOT, TODAY_SLOT], () => "same slot");

    expect(buttons.map((button) => (button.kind === "action" ? button.payload : null))).toEqual([
      { taskId: "t1", slotIndex: 0 },
      { taskId: "t1", slotIndex: 1 },
      { taskId: "t1", slotIndex: 2 },
    ]);
  });

  it("refuses more than three slots", () => {
    const four = [TODAY_SLOT, TODAY_SLOT, TODAY_SLOT, TODAY_SLOT];

    expect(MAX_SLOTS).toBe(3);
    expect(() => slotPickButtons("t1", four, () => "x")).toThrow(RenderError);
    expect(() => slotIndex(3)).toThrow(RenderError);
    expect(slotIndex(2)).toBe(2);
  });
});

describe("taskFacts", () => {
  it("shows deadline and estimate when known", () => {
    const facts = taskFacts({ deadline: "2026-09-25T15:00:00.000Z", durationMinutes: 120 }, ctx);

    expect(facts).toEqual([
      { label: "Срок", value: "в пт, 25 сент." },
      { label: "Оценка", value: "2 ч" },
    ]);
  });

  it("omits what is unknown", () => {
    expect(taskFacts({ deadline: null, durationMinutes: null }, ctx)).toEqual([]);
    expect(taskFacts({ deadline: null, durationMinutes: 30 }, ctx)).toEqual([{ label: "Оценка", value: "30 мин" }]);
  });
});
