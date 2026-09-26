import { describe, expect, it } from "vitest";
import { expectValidKeyboard, labels, makeEnViewContext, makeViewContext } from "../../testing/viewFixtures";
import { makeSettings } from "../../testing/domainFixtures";
import { settingsView } from "./settings";

const ctx = makeViewContext();

describe("settingsView", () => {
  it("shows every setting and a toggle for each", () => {
    const message = settingsView(makeSettings(), ctx);

    expect(message).toEqual({
      kind: "text",
      text:
        "<b>Настройки</b>\n\n" +
        "<b>Рабочие часы</b>: пн–пт, 09:00–18:00\n" +
        "<b>Часовой пояс</b>: Europe/Moscow\n" +
        "<b>Длина блока</b>: 30 мин\n" +
        "<b>Напоминания</b>: обычно\n" +
        "<b>Календарь</b>: не подключён\n\n" +
        "<i>Изменения применяются сразу.</i>",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [
        [
          { kind: "action", text: "Реже", action: "settings.toggle", payload: { key: "notification_intensity", value: "low" } },
          { kind: "action", text: "✓ Обычно", action: "settings.toggle", payload: { key: "notification_intensity", value: "normal" } },
          { kind: "action", text: "Чаще", action: "settings.toggle", payload: { key: "notification_intensity", value: "high" } },
        ],
        [
          { kind: "action", text: "15 мин", action: "settings.toggle", payload: { key: "block_length", value: "15" } },
          { kind: "action", text: "✓ 30 мин", action: "settings.toggle", payload: { key: "block_length", value: "30" } },
          { kind: "action", text: "45 мин", action: "settings.toggle", payload: { key: "block_length", value: "45" } },
          { kind: "action", text: "1 ч", action: "settings.toggle", payload: { key: "block_length", value: "60" } },
        ],
        [{ kind: "action", text: "Изменить рабочие часы", action: "settings.toggle", payload: { key: "working_hours" } }],
        [{ kind: "action", text: "Подключить календарь", action: "settings.toggle", payload: { key: "calendar", value: "connect" }, style: "primary" }],
        [{ kind: "web_app", text: "Открыть в приложении", url: "https://app.example.com/mini/settings" }],
      ],
    });
    expectValidKeyboard(message);
  });

  it("offers to disconnect a connected calendar, in red", () => {
    const message = settingsView(makeSettings({ calendarConnected: true }), makeViewContext({ miniAppUrl: null }));

    expect(message.kind === "text" && message.text).toContain("<b>Календарь</b>: подключён");
    expect(message.keyboard?.at(-1)).toEqual([
      { kind: "action", text: "Отключить календарь", action: "settings.toggle", payload: { key: "calendar", value: "disconnect" }, style: "danger" },
    ]);
  });

  it("marks the current choices", () => {
    const message = settingsView(makeSettings({ notificationIntensity: "high", defaultBlockMinutes: 60 }), ctx);

    expect(labels(message).slice(0, 2)).toEqual([
      ["Реже", "Обычно", "✓ Чаще"],
      ["15 мин", "30 мин", "45 мин", "✓ 1 ч"],
    ]);
  });

  it("shows a block length that is not among the presets without marking any", () => {
    const message = settingsView(makeSettings({ defaultBlockMinutes: 40 }), ctx);

    expect(message.kind === "text" && message.text).toContain("<b>Длина блока</b>: 40 мин");
    expect(labels(message)[1]).toEqual(["15 мин", "30 мин", "45 мин", "1 ч"]);
  });

  it.each([
    [[1, 2, 3, 4, 5], "пн–пт"],
    [[1, 2, 3, 4, 5, 6, 7], "каждый день"],
    [[6, 7], "сб, вс"],
    [[1, 3, 5], "пн, ср, пт"],
    [[7, 1, 2, 3], "пн–ср, вс"],
    [[1, 2], "пн, вт"],
    [[], "нет рабочих дней"],
  ])("writes the working days %j as %s", (isoDays, expected) => {
    const message = settingsView(
      makeSettings({ workingHours: { isoDays, start: "10:00", end: "19:00" } }),
      ctx,
    );

    expect(message.kind === "text" && message.text).toContain(`<b>Рабочие часы</b>: ${expected}${isoDays.length === 0 ? "" : ", 10:00–19:00"}`);
  });

  it("escapes the timezone name", () => {
    const message = settingsView(makeSettings({ timezone: "Europe/Moscow" }), ctx);

    expect(message.kind === "text" && message.text).toContain("Europe/Moscow");
  });

  it("speaks English", () => {
    const message = settingsView(makeSettings(), makeEnViewContext());

    expect(message.kind === "text" && message.text).toContain("<b>Working hours</b>: Mon–Fri, 09:00–18:00");
    expect(labels(message)[0]).toEqual(["Less often", "✓ Normal", "More often"]);
  });
});
