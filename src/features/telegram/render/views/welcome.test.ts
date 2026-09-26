import { describe, expect, it } from "vitest";
import { expectValidKeyboard, makeEnViewContext, makeViewContext } from "../../testing/viewFixtures";
import { welcomeView } from "./welcome";

const ctx = makeViewContext();

describe("welcomeView", () => {
  it("greets by name, explains the three ways to start and offers to connect a calendar", () => {
    const message = welcomeView({ firstName: "Аня", calendarConnected: false }, ctx);

    expect(message).toEqual({
      kind: "text",
      text:
        "<b>Привет, Аня!</b>\n\n" +
        "Я помогу найти время для задач и поставить его в календарь.\n\n" +
        "• Напиши задачу, например «подготовить презентацию до пятницы, часа на два»\n" +
        "• Перешли сообщение — предложу, что с ним сделать\n" +
        "• В группе ответь на сообщение и упомяни меня — время подберу только тебе\n\n" +
        "<i>Календарь пока не подключён. Подключи его, и я учту твои занятые часы.</i>",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [
        [{ kind: "action", text: "Подключить календарь", action: "settings.toggle", payload: { key: "calendar", value: "connect" }, style: "primary" }],
        [{ kind: "switch_inline", text: "Свободное время сегодня", query: "свободное время сегодня", mode: "current_chat" }],
        [{ kind: "web_app", text: "Открыть планировщик", url: "https://app.example.com/mini" }],
      ],
    });
    expectValidKeyboard(message);
  });

  it("greets without a name and drops the calendar hint and button once connected", () => {
    const message = welcomeView({ firstName: null, calendarConnected: true }, ctx);

    expect(message.kind === "text" && message.text.startsWith("<b>Привет!</b>\n\n")).toBe(true);
    expect(message.kind === "text" && message.text).not.toContain("Календарь пока не подключён");
    expect(message.keyboard?.map((row) => row.map((button) => button.kind))).toEqual([
      ["switch_inline"],
      ["web_app"],
    ]);
  });

  it("omits the Mini App button when no Mini App is configured", () => {
    const message = welcomeView({ firstName: null, calendarConnected: true }, makeViewContext({ miniAppUrl: null }));

    expect(message.keyboard?.flat().map((button) => button.kind)).toEqual(["switch_inline"]);
  });

  it("escapes and shortens the name", () => {
    const message = welcomeView({ firstName: "<b>Аня</b> & " + "я".repeat(100), calendarConnected: true }, ctx);

    expect(message.kind === "text" && message.text.split("\n")[0]).toMatch(/^<b>Привет, &lt;b&gt;Аня&lt;\/b&gt; &amp; я+…!<\/b>$/);
  });

  it("speaks English with the English catalog", () => {
    const message = welcomeView({ firstName: "Anna", calendarConnected: false }, makeEnViewContext());

    expect(message.kind === "text" && message.text.startsWith("<b>Hi, Anna!</b>\n\nI find time")).toBe(true);
    expect(message.keyboard?.[0]?.[0]?.text).toBe("Connect calendar");
  });
});
