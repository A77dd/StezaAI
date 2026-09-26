import { describe, expect, it } from "vitest";
import { expectValidKeyboard, labels, makeEnViewContext, makeViewContext, SLOT_HTML, TODAY_SLOT } from "../../testing/viewFixtures";
import { RenderError } from "../errors";
import { reminderView } from "./reminder";

const task = { id: "task_1", title: "Подготовить презентацию" };
const ctx = makeViewContext();

describe("reminderView", () => {
  it("before the block: tells how long is left, when it is, and offers to reschedule", () => {
    const message = reminderView({ task, slot: TODAY_SLOT, phase: "before", minutesUntilStart: 10 }, ctx);

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

  it("speaks in hours for long waits", () => {
    const message = reminderView({ task, slot: TODAY_SLOT, phase: "before", minutesUntilStart: 90 }, ctx);

    expect(message.kind === "text" && message.text).toContain("Начало через 1 ч 30 мин.");
  });

  it("started: says it is time to begin", () => {
    const message = reminderView({ task, slot: TODAY_SLOT, phase: "started" }, ctx);

    expect(message.kind === "text" && message.text).toContain("\n\nПора начинать.\n\n");
    expect(message.kind === "text" && message.text).not.toContain("Начало через");
  });

  it("overdue: says the block is already going or over, never 'time to start'", () => {
    const message = reminderView({ task, slot: TODAY_SLOT, phase: "overdue" }, ctx);

    expect(message.kind === "text" && message.text).toContain("\n\nБлок уже идёт или закончился.\n\n");
    expect(message.kind === "text" && message.text).not.toContain("Пора начинать");
  });

  it("does not read the clock: the phase comes from the caller", () => {
    const early = reminderView({ task, slot: TODAY_SLOT, phase: "started" }, makeViewContext({ now: "2026-09-20T00:00:00.000Z" }));
    const late = reminderView({ task, slot: TODAY_SLOT, phase: "started" }, makeViewContext({ now: "2026-09-30T00:00:00.000Z" }));

    expect(early).toEqual(late);
  });

  it("rejects a countdown that is not a whole number of minutes, at least one", () => {
    expect(() => reminderView({ task, slot: TODAY_SLOT, phase: "before", minutesUntilStart: 0 }, ctx)).toThrow(RenderError);
    expect(() => reminderView({ task, slot: TODAY_SLOT, phase: "before", minutesUntilStart: 2.5 }, ctx)).toThrow(RenderError);
  });

  it("escapes the title and speaks English", () => {
    const message = reminderView(
      { task: { id: "t", title: "<b>Deck</b> & co" }, slot: TODAY_SLOT, phase: "before", minutesUntilStart: 10 },
      makeEnViewContext(),
    );
    const overdue = reminderView({ task, slot: TODAY_SLOT, phase: "overdue" }, makeEnViewContext());

    expect(message.kind === "text" && message.text).toContain("<b>&lt;b&gt;Deck&lt;/b&gt; &amp; co</b>");
    expect(message.kind === "text" && message.text).toContain("Starts in 10 min.");
    expect(overdue.kind === "text" && overdue.text).toContain("The block is already underway or over.");
    expect(labels(message)).toEqual([["Reschedule", "Edit"]]);
  });
});
