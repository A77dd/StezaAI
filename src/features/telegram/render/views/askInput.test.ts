import { describe, expect, it } from "vitest";
import { expectValidKeyboard, makeEnViewContext, makeViewContext } from "../../testing/viewFixtures";
import { askInputView } from "./askInput";

const ctx = makeViewContext();

describe("askInputView", () => {
  it("asks for a timezone with a few one-tap presets", () => {
    const message = askInputView({ kind: "timezone" }, ctx);

    expect(message.kind === "text" && message.text).toBe(
      "Укажи свой часовой пояс, например Europe/Moscow, или выбери один из вариантов.",
    );
    expect(message.keyboard).toEqual([
      [
        { kind: "action", text: "Europe/Moscow", action: "settings.timezone", payload: { tz: "Europe/Moscow" } },
        { kind: "action", text: "Europe/Kyiv", action: "settings.timezone", payload: { tz: "Europe/Kyiv" } },
      ],
      [
        { kind: "action", text: "Asia/Almaty", action: "settings.timezone", payload: { tz: "Asia/Almaty" } },
        { kind: "action", text: "UTC", action: "settings.timezone", payload: { tz: "UTC" } },
      ],
    ]);
    expectValidKeyboard(message);
  });

  it("asks what to change about a task, with no keyboard", () => {
    const message = askInputView({ kind: "task_edit" }, ctx);

    expect(message).toEqual({
      kind: "text",
      text: "Что изменить?",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: null,
    });
  });

  it("asks for new working hours", () => {
    const message = askInputView({ kind: "working_hours" }, ctx);

    expect(message.kind === "text" && message.text).toBe('Напиши рабочие часы, например «09:00-18:00 пн-пт».');
  });

  it("speaks English", () => {
    const message = askInputView({ kind: "timezone" }, makeEnViewContext());

    expect(message.kind === "text" && message.text).toContain("Send your timezone");
    expect(message.keyboard?.flat().map((button) => button.text)).toEqual([
      "Europe/Moscow",
      "Europe/Kyiv",
      "Asia/Almaty",
      "UTC",
    ]);
  });
});
