import { describe, expect, it } from "vitest";
import { HELP_COMMANDS } from "../catalog";
import { RenderError } from "../errors";
import { expectValidKeyboard, makeEnViewContext, makeViewContext } from "../../testing/viewFixtures";
import { helpView } from "./help";

const IMPLEMENTED = ["settings", "export", "deleteme"] as const;

describe("helpView", () => {
  it("lists what the bot does, the inline hint and the commands the caller says exist", () => {
    const message = helpView({ availableCommands: IMPLEMENTED }, makeViewContext());

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
        "/deleteme — удалить мои данные\n" +
        "/export — выгрузить мои данные\n\n" +
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

  it("lists commands in the fixed order whatever order the caller gives", () => {
    const message = helpView({ availableCommands: ["export", "week", "start", "today", "help"] }, makeViewContext());

    expect(message.kind === "text" && message.text).toContain(
      "<b>Команды</b>\n/start — начать заново\n/help — что я умею\n/today — план на сегодня\n/week — план на неделю\n/export — выгрузить мои данные",
    );
  });

  it("never mentions a command the caller did not list", () => {
    const message = helpView({ availableCommands: ["help"] }, makeViewContext());
    const text = message.kind === "text" ? message.text : "";

    for (const command of HELP_COMMANDS.filter((name) => name !== "help")) expect(text).not.toContain(`/${command}`);
  });

  it("omits the commands block when there are none", () => {
    const message = helpView({ availableCommands: [] }, makeViewContext());

    expect(message.kind === "text" && message.text).not.toContain("Команды");
    expect(message.kind === "text" && message.text).toContain("слова «свободное время».\n\n<i>Всё, что я запоминаю");
  });

  it("counts a repeated command once and rejects one it does not know", () => {
    const message = helpView({ availableCommands: ["help", "help"] }, makeViewContext());

    expect(message.kind === "text" && message.text.match(/\/help/g)).toHaveLength(1);
    expect(() => helpView({ availableCommands: ["nope"] as never }, makeViewContext())).toThrow(RenderError);
  });

  it("omits the Mini App button without a Mini App", () => {
    const message = helpView({ availableCommands: [] }, makeViewContext({ miniAppUrl: null }));

    expect(message.keyboard?.flat().map((button) => button.kind)).toEqual(["switch_inline"]);
  });

  it("speaks English", () => {
    const message = helpView({ availableCommands: IMPLEMENTED }, makeEnViewContext());

    expect(message.kind === "text" && message.text.startsWith("<b>What I can do</b>")).toBe(true);
    expect(message.kind === "text" && message.text).toContain("type @steza_test_bot and the words “free time”");
    expect(message.kind === "text" && message.text).toContain("/deleteme — delete my data");
  });
});
