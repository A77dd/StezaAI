import { describe, expect, it } from "vitest";
import { expectValidKeyboard, labels, makeEnViewContext, makeViewContext, SLOT_HTML, TODAY_SLOT } from "../../testing/viewFixtures";
import { reminderView } from "./reminder";

const task = { id: "task_1", title: "Подготовить презентацию" };

describe("reminderView", () => {
  it("tells how long is left, when the block is, and offers to reschedule", () => {
    // 15:50 in Moscow, ten minutes before the 16:00 block.
    const ctx = makeViewContext({ now: "2026-09-23T12:50:00.000Z" });
    const message = reminderView({ task, slot: TODAY_SLOT }, ctx);

    expect(message).toEqual({
      kind: "text",
      text:
        "<b>Подготовить презентацию</b>\n\n" +
        `<b>Когда</b>: ${SLOT_HTML.today}\n\n` +
        "Начало через 10 мин.\n\n" +
        "<i>Не получается? Перенеси, и я подберу другое время.</i>",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [
        [
          { kind: "action", text: "Перенести", action: "slot.other", payload: { taskId: "task_1" } },
          { kind: "action", text: "Изменить", action: "task.edit", payload: { taskId: "task_1" } },
        ],
      ],
    });
    expectValidKeyboard(message);
  });

  it("rounds a partial minute up and speaks in hours for long waits", () => {
    const soon = reminderView({ task, slot: TODAY_SLOT }, makeViewContext({ now: "2026-09-23T12:59:01.000Z" }));
    const later = reminderView({ task, slot: TODAY_SLOT }, makeViewContext({ now: "2026-09-23T11:30:00.000Z" }));

    expect(soon.kind === "text" && soon.text).toContain("Начало через 1 мин.");
    expect(later.kind === "text" && later.text).toContain("Начало через 1 ч 30 мин.");
  });

  it("says it is time when the block has started", () => {
    const message = reminderView({ task, slot: TODAY_SLOT }, makeViewContext({ now: "2026-09-23T13:05:00.000Z" }));

    expect(message.kind === "text" && message.text).toContain("Пора начинать.");
    expect(message.kind === "text" && message.text).not.toContain("Начало через");
  });

  it("escapes the title and speaks English", () => {
    const message = reminderView(
      { task: { id: "t", title: "<b>Deck</b> & co" }, slot: TODAY_SLOT },
      makeEnViewContext({ now: "2026-09-23T12:50:00.000Z" }),
    );

    expect(message.kind === "text" && message.text).toContain("<b>&lt;b&gt;Deck&lt;/b&gt; &amp; co</b>");
    expect(message.kind === "text" && message.text).toContain("Starts in 10 min.");
    expect(labels(message)).toEqual([["Reschedule", "Edit"]]);
  });
});
