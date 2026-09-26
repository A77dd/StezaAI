import { describe, expect, it } from "vitest";
import {
  expectValidKeyboard,
  FRIDAY_SLOT,
  labels,
  makeEnViewContext,
  makeViewContext,
  SLOT_HTML,
  TODAY_SLOT,
  TOMORROW_SLOT,
} from "../../testing/viewFixtures";
import { RenderError } from "../errors";
import { taskProposalView } from "./taskProposal";
import type { TaskProposalInput } from "./taskProposal";

const ctx = makeViewContext();
const task = {
  id: "task_1",
  title: "Подготовить презентацию",
  deadline: "2026-09-25T15:00:00.000Z",
  durationMinutes: 120,
};

describe("taskProposalView: proposed", () => {
  it("shows the card with found slots and slot buttons, the first one blue", () => {
    const message = taskProposalView({ state: "proposed", task, slots: [TODAY_SLOT, TOMORROW_SLOT] }, ctx);

    expect(message).toEqual({
      kind: "text",
      text:
        "<b>Подготовить презентацию</b>\n\n" +
        "<b>Срок</b>: в пт, 25 сент.\n" +
        "<b>Оценка</b>: 2 ч\n\n" +
        "<b>Нашёл время:</b>\n" +
        `• ${SLOT_HTML.today}\n` +
        `• ${SLOT_HTML.tomorrow}`,
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [
        [
          { kind: "action", text: "Сегодня 16:00", action: "slot.pick", payload: { taskId: "task_1", slotIndex: 0 }, style: "primary" },
          { kind: "action", text: "Завтра 10:00", action: "slot.pick", payload: { taskId: "task_1", slotIndex: 1 } },
        ],
        [
          { kind: "action", text: "Другое время", action: "slot.other", payload: { taskId: "task_1" } },
          { kind: "action", text: "Изменить", action: "task.edit", payload: { taskId: "task_1" } },
        ],
      ],
    });
    expectValidKeyboard(message);
  });

  it("offers a green [Поставить] when there is a single slot", () => {
    const message = taskProposalView({ state: "proposed", task, slots: [FRIDAY_SLOT] }, ctx);

    expect(labels(message)).toEqual([["Поставить"], ["Другое время", "Изменить"]]);
    expect(message.keyboard?.[0]?.[0]).toMatchObject({
      action: "slot.pick",
      payload: { taskId: "task_1", slotIndex: 0 },
      style: "success",
    });
  });

  it("supports three slots and omits unknown deadline and estimate", () => {
    const message = taskProposalView(
      {
        state: "proposed",
        task: { ...task, deadline: null, durationMinutes: null },
        slots: [TODAY_SLOT, TOMORROW_SLOT, FRIDAY_SLOT],
      },
      ctx,
    );

    expect(labels(message)[0]).toEqual(["Сегодня 16:00", "Завтра 10:00", "Пт 11:00"]);
    expect(message.kind === "text" && message.text.startsWith("<b>Подготовить презентацию</b>\n\n<b>Нашёл время:</b>")).toBe(true);
  });

  it("rejects an empty or too long slot list", () => {
    expect(() => taskProposalView({ state: "proposed", task, slots: [] }, ctx)).toThrow(RenderError);
    expect(() =>
      taskProposalView({ state: "proposed", task, slots: [TODAY_SLOT, TODAY_SLOT, TODAY_SLOT, TODAY_SLOT] }, ctx),
    ).toThrow(RenderError);
  });
});

describe("taskProposalView: booked", () => {
  it("keeps a disabled Поставлено button and offers to copy the time", () => {
    const message = taskProposalView({ state: "booked", task, slot: TODAY_SLOT }, ctx);

    expect(message).toEqual({
      kind: "text",
      text:
        "<b>Подготовить презентацию</b>\n\n" +
        "<b>Срок</b>: в пт, 25 сент.\n" +
        "<b>Оценка</b>: 2 ч\n" +
        `<b>Когда</b>: ${SLOT_HTML.today}\n\n` +
        "<i>Напомню перед началом.</i>",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [
        [{ kind: "disabled", text: "✅ Поставлено" }],
        [{ kind: "copy_text", text: "Скопировать время", copyText: "ср, 16:00–17:00" }],
      ],
    });
    expectValidKeyboard(message);
  });
});

describe("taskProposalView: cancelled", () => {
  it("strikes the title through and disables the card", () => {
    const message = taskProposalView({ state: "cancelled", task }, ctx);

    expect(message).toEqual({
      kind: "text",
      text: "<b><s>Подготовить презентацию</s></b>\n\nЗадача отменена.",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [[{ kind: "disabled", text: "Отменено" }]],
    });
  });
});

describe("taskProposalView: no_slots", () => {
  it("explains that nothing is free before the deadline", () => {
    const message = taskProposalView(
      { state: "no_slots", task, search: { exhausted: "none_before_deadline", searchedUntil: task.deadline } },
      ctx,
    );

    expect(message).toEqual({
      kind: "text",
      text:
        "<b>Подготовить презентацию</b>\n\n" +
        "<b>Срок</b>: в пт, 25 сент.\n" +
        "<b>Оценка</b>: 2 ч\n\n" +
        "До срока свободного времени не нашлось. Можно выбрать время вручную или сдвинуть срок.",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [
        [
          { kind: "action", text: "Другое время", action: "slot.other", payload: { taskId: "task_1" }, style: "primary" },
          { kind: "action", text: "Изменить", action: "task.edit", payload: { taskId: "task_1" } },
        ],
      ],
    });
    expectValidKeyboard(message);
  });

  it("says how many days were searched when only the horizon was reached", () => {
    const message = taskProposalView(
      {
        state: "no_slots",
        task: { ...task, deadline: null },
        search: { exhausted: "horizon_reached", searchedUntil: "2026-09-30T09:00:00.000Z" },
      },
      ctx,
    );

    expect(message.kind === "text" && message.text).toContain(
      "В ближайшие 7 дней свободного времени нет. Можно выбрать время вручную.",
    );
    expect(message.kind === "text" && message.text).not.toContain("До срока");
  });

  it.each([
    ["2026-09-24T09:00:00.000Z", "В ближайший день свободного времени нет."],
    ["2026-09-25T09:00:00.000Z", "В ближайшие 2 дня свободного времени нет."],
    ["2026-09-28T09:00:00.000Z", "В ближайшие 5 дней свободного времени нет."],
    ["2026-10-14T09:00:00.000Z", "В ближайшие 21 день свободного времени нет."],
    ["2026-10-15T09:00:00.000Z", "В ближайшие 22 дня свободного времени нет."],
  ])("declines the day count in Russian: searched until %s", (searchedUntil, sentence) => {
    const message = taskProposalView(
      { state: "no_slots", task: { ...task, deadline: null }, search: { exhausted: "horizon_reached", searchedUntil } },
      ctx,
    );

    expect(message.kind === "text" && message.text).toContain(sentence);
  });

  it("counts days in English too", () => {
    const en = makeEnViewContext();
    const search = (searchedUntil: string) => ({ exhausted: "horizon_reached", searchedUntil }) as const;
    const text = (searchedUntil: string) => {
      const message = taskProposalView({ state: "no_slots", task: { ...task, deadline: null }, search: search(searchedUntil) }, en);
      return message.kind === "text" ? message.text : "";
    };

    expect(text("2026-09-24T09:00:00.000Z")).toContain("There is no free time in the next day.");
    expect(text("2026-09-30T09:00:00.000Z")).toContain("There is no free time in the next 7 days.");
  });

  it("rejects a search result that actually found time, or that searched no days", () => {
    const found: TaskProposalInput = {
      state: "no_slots",
      task,
      search: { exhausted: "found", searchedUntil: "2026-09-30T09:00:00.000Z" },
    };
    const same: TaskProposalInput = {
      state: "no_slots",
      task,
      search: { exhausted: "horizon_reached", searchedUntil: "2026-09-23T15:00:00.000Z" },
    };

    expect(() => taskProposalView(found, ctx)).toThrow(RenderError);
    expect(() => taskProposalView(same, ctx)).toThrow(RenderError);
  });
});

describe("taskProposalView: English", () => {
  it("renders the proposed card with the English catalog", () => {
    const message = taskProposalView(
      { state: "proposed", task, slots: [TODAY_SLOT, TOMORROW_SLOT] },
      makeEnViewContext(),
    );

    expect(message.kind === "text" && message.text).toContain("<b>Deadline</b>: Fri, Sep 25\n<b>Estimate</b>: 2 h");
    expect(message.kind === "text" && message.text).toContain("<b>Found time:</b>");
    expect(labels(message)).toEqual([["Today 16:00", "Tomorrow 10:00"], ["Other time", "Edit"]]);
  });
});

describe("taskProposalView: user text", () => {
  it("escapes markup in the title and cuts a 200-character title explicitly", () => {
    const title = `<b>&amp;</b> </a> 😀${"ы".repeat(200)}`;
    const message = taskProposalView({ state: "proposed", task: { ...task, title }, slots: [TODAY_SLOT] }, ctx);

    const [first] = (message.kind === "text" ? message.text : "").split("\n");
    expect(first).toMatch(/^<b>&lt;b&gt;&amp;amp;&lt;\/b&gt; &lt;\/a&gt; 😀ы+…<\/b>$/);
    expect(message.kind === "text" && message.text).not.toContain("<b>&amp;");
  });
});
