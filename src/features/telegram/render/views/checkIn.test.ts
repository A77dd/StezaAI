import { describe, expect, it } from "vitest";
import { CHECK_IN_OUTCOMES, CHECK_IN_REASONS } from "../../domain";
import { expectValidKeyboard, labels, makeEnViewContext, makeViewContext } from "../../testing/viewFixtures";
import { checkInView } from "./checkIn";

const ctx = makeViewContext();
const task = { title: "Подготовить презентацию" };

describe("checkInView: question", () => {
  it("asks how it went with the four outcomes", () => {
    const message = checkInView({ stage: "question", checkInId: "ci_1", task }, ctx);

    expect(message).toEqual({
      kind: "text",
      text: "<b>Как прошло?</b>\n\n«Подготовить презентацию»",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [
        [
          { kind: "action", text: "Готово", action: "checkin.answer", payload: { checkInId: "ci_1", outcome: "done" }, style: "success" },
          { kind: "action", text: "Нужно ещё время", action: "checkin.answer", payload: { checkInId: "ci_1", outcome: "needs_time" } },
        ],
        [
          { kind: "action", text: "Не начал", action: "checkin.answer", payload: { checkInId: "ci_1", outcome: "not_started" } },
          { kind: "action", text: "Заблокировано", action: "checkin.answer", payload: { checkInId: "ci_1", outcome: "blocked" } },
        ],
      ],
    });
    expectValidKeyboard(message);
  });

  it("offers every outcome the domain knows", () => {
    const message = checkInView({ stage: "question", checkInId: "ci_1", task }, ctx);
    const outcomes = message.keyboard?.flat().map((button) => (button.kind === "action" && button.action === "checkin.answer" ? button.payload.outcome : null));

    expect(outcomes).toEqual([...CHECK_IN_OUTCOMES]);
  });
});

describe("checkInView: reason", () => {
  it("asks what got in the way, one reason per row", () => {
    const message = checkInView({ stage: "reason", checkInId: "ci_1", task }, ctx);

    expect(message.kind === "text" && message.text).toBe("<b>Что помешало?</b>\n\n«Подготовить презентацию»");
    expect(labels(message)).toEqual([
      ["Не хватило времени"],
      ["Слишком большая задача"],
      ["Не понял, с чего начать"],
      ["Появилось более важное"],
      ["Просто отложил"],
    ]);
    expect(message.keyboard?.flat().map((button) => (button.kind === "action" && button.action === "checkin.reason" ? button.payload.reason : null))).toEqual([
      ...CHECK_IN_REASONS,
    ]);
    expectValidKeyboard(message);
  });
});

describe("checkInView: answered", () => {
  it("records the outcome and disables the card", () => {
    const message = checkInView({ stage: "answered", outcome: "done", reason: null }, ctx);

    expect(message).toEqual({
      kind: "text",
      text: "<b>Записал</b>\n\n<b>Итог</b>: Готово",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [[{ kind: "disabled", text: "✅ Записано" }]],
    });
  });

  it("adds the reason when there is one", () => {
    const message = checkInView({ stage: "answered", outcome: "not_started", reason: "task_too_big" }, ctx);

    expect(message.kind === "text" && message.text).toBe(
      "<b>Записал</b>\n\n<b>Итог</b>: Не начал\n<b>Причина</b>: Слишком большая задача",
    );
  });
});

describe("checkInView: text and English", () => {
  it("escapes the title", () => {
    const message = checkInView({ stage: "question", checkInId: "c", task: { title: "<b>x</b> & </a>" } }, ctx);

    expect(message.kind === "text" && message.text).toContain("«&lt;b&gt;x&lt;/b&gt; &amp; &lt;/a&gt;»");
  });

  it("speaks English", () => {
    const message = checkInView({ stage: "question", checkInId: "c", task }, makeEnViewContext());

    expect(message.kind === "text" && message.text.startsWith("<b>How did it go?</b>")).toBe(true);
    expect(labels(message)).toEqual([["Done", "Need more time"], ["Did not start", "Blocked"]]);
  });
});
