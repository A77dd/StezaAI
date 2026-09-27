import { describe, expect, it } from "vitest";
import { expectValidKeyboard, makeEnViewContext, makeViewContext } from "../../testing/viewFixtures";
import { personalClarifyView, personalInfoOnlyView } from "./personalClarify";

const ctx = makeViewContext();

describe("personalClarifyView", () => {
  it("asks which kind the message is, with one button per plausible kind", () => {
    const message = personalClarifyView({ draftId: "draft_1", title: "созвон с Аней" }, ctx);

    expect(message).toEqual({
      kind: "text",
      text: "Не уверен, что это: «созвон с Аней».\n\n<i>Выбери, что подходит:</i>",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [
        [
          { kind: "action", text: "Это задача", action: "intent.choose", payload: { draftId: "draft_1", kind: "task" } },
          { kind: "action", text: "Это встреча", action: "intent.choose", payload: { draftId: "draft_1", kind: "meeting" } },
        ],
        [
          { kind: "action", text: "Напомнить", action: "intent.choose", payload: { draftId: "draft_1", kind: "reminder" } },
          { kind: "action", text: "Нужно ответить", action: "intent.choose", payload: { draftId: "draft_1", kind: "follow_up" } },
        ],
        [{ kind: "action", text: "Просто запомнить", action: "intent.choose", payload: { draftId: "draft_1", kind: "info" } }],
      ],
    });
    expectValidKeyboard(message);
  });

  it("escapes and shortens the title", () => {
    const message = personalClarifyView({ draftId: "draft_1", title: "<b>x</b> & " + "я".repeat(200) }, ctx);

    expect(message.kind === "text" && message.text).toContain("&lt;b&gt;x&lt;/b&gt; &amp; я");
    expect(message.kind === "text" && message.text).toContain("…");
  });

  it("speaks English with the English catalog", () => {
    const message = personalClarifyView({ draftId: "draft_1", title: "call Anna" }, makeEnViewContext());

    expect(message.kind === "text" && message.text).toContain("Not sure what this is: “call Anna”.");
    expect(message.keyboard?.flat().map((button) => button.text)).toEqual([
      "It is a task",
      "It is a meeting",
      "Remind me",
      "Needs a reply",
      "Just remember",
    ]);
  });
});

describe("personalInfoOnlyView", () => {
  it("offers to remember a definitive info classification, with no source quote", () => {
    const message = personalInfoOnlyView({ draftId: "draft_2", title: "курс доллара вырос" }, ctx);

    expect(message).toEqual({
      kind: "text",
      text:
        "Здесь нет задачи, это скорее информация: «курс доллара вырос». Запомнить?\n\n" +
        "<i>Сохраню только после твоего подтверждения.</i>",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [
        [
          {
            kind: "action",
            text: "Запомнить",
            action: "context.choose",
            payload: { draftId: "draft_2", choice: "remember" },
            style: "success",
          },
        ],
      ],
    });
    expectValidKeyboard(message);
  });

  it("speaks English", () => {
    const message = personalInfoOnlyView({ draftId: "draft_2", title: "the dollar went up" }, makeEnViewContext());

    expect(message.kind === "text" && message.text).toContain("it looks like information: “the dollar went up”");
    expect(message.keyboard?.[0]?.[0]?.text).toBe("Remember");
  });
});
