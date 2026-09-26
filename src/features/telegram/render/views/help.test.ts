import { describe, expect, it } from "vitest";
import { expectValidKeyboard, makeEnViewContext, makeViewContext } from "../../testing/viewFixtures";
import { helpView } from "./help";

describe("helpView", () => {
  it("lists what the bot does, the inline hint and the commands", () => {
    const message = helpView(makeViewContext());

    expect(message).toEqual({
      kind: "text",
      text:
        "<b>Что я умею</b>\n\n" +
        "• Личные задачи: напиши, что нужно сделать, — предложу время и поставлю блок в календарь.\n" +
        "• Пересланные сообщения: пойму, это встреча, задача или просто информация.\n" +
        "• Группы: ответь на сообщение и упомяни меня. Время подберу только тебе, а детали календаря в группе не покажу.\n\n" +
        "Быстрый доступ: в любом чате набери @steza_test_bot и слова «свободное время».\n\n" +
        "<b>Команды</b>\n" +
        "/settings — настройки\n" +
        "/export — выгрузить мои данные\n" +
        "/deleteme — удалить мои данные\n\n" +
        "<i>Всё, что я запоминаю, ты можешь посмотреть, исправить и удалить.</i>",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [
        [{ kind: "switch_inline", text: "Свободное время сегодня", query: "свободное время сегодня", mode: "current_chat" }],
        [{ kind: "web_app", text: "Открыть планировщик", url: "https://app.example.com/mini" }],
      ],
    });
    expectValidKeyboard(message);
  });

  it("omits the Mini App button without a Mini App", () => {
    const message = helpView(makeViewContext({ miniAppUrl: null }));

    expect(message.keyboard?.flat().map((button) => button.kind)).toEqual(["switch_inline"]);
  });

  it("speaks English", () => {
    const message = helpView(makeEnViewContext());

    expect(message.kind === "text" && message.text.startsWith("<b>What I can do</b>")).toBe(true);
    expect(message.kind === "text" && message.text).toContain("type @steza_test_bot and the words “free time”");
  });
});
