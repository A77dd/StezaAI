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
import { groupChooserView } from "./groupChooser";
import { groupPointerView } from "./groupPointer";
import { groupSlotsView } from "./groupSlots";

const ctx = makeViewContext();

describe("groupChooserView", () => {
  it("asks what to do with the message and offers the three choices", () => {
    const message = groupChooserView({ draftId: "draft_1", title: "Созвон по бюджету" }, ctx);

    expect(message).toEqual({
      kind: "text",
      text: "<b>Что сделать?</b>\n\n«Созвон по бюджету»",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [
        [{ kind: "action", text: "Мне в календарь", action: "context.choose", payload: { draftId: "draft_1", choice: "personal" }, style: "primary" }],
        [{ kind: "action", text: "Зафиксировать для группы", action: "context.choose", payload: { draftId: "draft_1", choice: "group" } }],
        [{ kind: "action", text: "Просто запомнить", action: "context.choose", payload: { draftId: "draft_1", choice: "remember" } }],
      ],
    });
    expectValidKeyboard(message);
  });

  it("escapes the title", () => {
    const message = groupChooserView({ draftId: "d", title: "<b>x</b> & </a>" }, ctx);

    expect(message.kind === "text" && message.text).toBe("<b>Что сделать?</b>\n\n«&lt;b&gt;x&lt;/b&gt; &amp; &lt;/a&gt;»");
  });
});

describe("groupPointerView", () => {
  it("says only that the answer is private and links to the private chat", () => {
    const message = groupPointerView({ startPayload: "g_abc-123" }, ctx);

    expect(message).toEqual({
      kind: "text",
      text: "Ответ подготовил в личных сообщениях — там же можно выбрать время.",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [[{ kind: "url", text: "Открыть личный чат", url: "https://t.me/steza_test_bot?start=g_abc-123" }]],
    });
    expectValidKeyboard(message);
  });

  it("rejects a payload Telegram would not accept", () => {
    expect(() => groupPointerView({ startPayload: "not valid!" }, ctx)).toThrow(RenderError);
  });

  it("speaks English", () => {
    const message = groupPointerView({ startPayload: "x" }, makeEnViewContext());

    expect(message.kind === "text" && message.text).toBe("I prepared the answer in a private chat, where you can also pick a time.");
  });
});

describe("groupSlotsView", () => {
  const task = { id: "task_2", title: "Созвон по бюджету" };

  it("presents the windows privately with add-buttons named by day", () => {
    const message = groupSlotsView({ task, slots: [TOMORROW_SLOT, FRIDAY_SLOT], groupTitle: "Маркетинг" }, ctx);

    expect(message).toEqual({
      kind: "text",
      text:
        "<b>Созвон по бюджету</b>\n\n" +
        "Нашёл два окна:\n" +
        `• ${SLOT_HTML.tomorrow}\n` +
        `• ${SLOT_HTML.friday}\n\n` +
        "<i>Запрос из группы «Маркетинг»</i>",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [
        [
          { kind: "action", text: "+ Завтра 10:00", action: "slot.pick", payload: { taskId: "task_2", slotIndex: 0 }, style: "success" },
          { kind: "action", text: "+ Пт 11:00", action: "slot.pick", payload: { taskId: "task_2", slotIndex: 1 }, style: "success" },
        ],
        [{ kind: "action", text: "Другое время", action: "slot.other", payload: { taskId: "task_2" } }],
      ],
    });
    expectValidKeyboard(message);
  });

  it("counts the windows in words and omits the footer without a group name", () => {
    const one = groupSlotsView({ task, slots: [TOMORROW_SLOT], groupTitle: null }, ctx);
    const three = groupSlotsView({ task, slots: [TOMORROW_SLOT, FRIDAY_SLOT, FRIDAY_SLOT], groupTitle: null }, ctx);

    expect(one.kind === "text" && one.text).toContain("Нашёл окно:");
    expect(one.kind === "text" && one.text).not.toContain("Запрос из группы");
    expect(three.kind === "text" && three.text).toContain("Нашёл три окна:");
  });

  it("escapes the group name and title", () => {
    const message = groupSlotsView({ task: { id: "t", title: "<i>x</i>" }, slots: [TOMORROW_SLOT], groupTitle: "A & <b>B</b>" }, ctx);

    expect(message.kind === "text" && message.text).toContain("<b>&lt;i&gt;x&lt;/i&gt;</b>");
    expect(message.kind === "text" && message.text).toContain("«A &amp; &lt;b&gt;B&lt;/b&gt;»");
  });

  it("puts at most two add-buttons in a row so labels are not cut on a phone", () => {
    const message = groupSlotsView({ task, slots: [TOMORROW_SLOT, FRIDAY_SLOT, TODAY_SLOT], groupTitle: null }, ctx);

    expect(labels(message)).toEqual([["+ Завтра 10:00", "+ Пт 11:00"], ["+ Сегодня 16:00"], ["Другое время"]]);
    expect(message.keyboard?.[0]?.[0]).toMatchObject({ style: "success", payload: { slotIndex: 0 } });
    expect(message.keyboard?.[1]?.[0]).toMatchObject({ style: "success", payload: { slotIndex: 2 } });
  });

  it("rejects no windows and more than three", () => {
    expect(() => groupSlotsView({ task, slots: [], groupTitle: null }, ctx)).toThrow(RenderError);
    expect(() =>
      groupSlotsView({ task, slots: [TOMORROW_SLOT, TOMORROW_SLOT, TOMORROW_SLOT, TOMORROW_SLOT], groupTitle: null }, ctx),
    ).toThrow(RenderError);
  });

  it("speaks English", () => {
    const message = groupSlotsView({ task, slots: [TOMORROW_SLOT, FRIDAY_SLOT], groupTitle: "Marketing" }, makeEnViewContext());

    expect(message.kind === "text" && message.text).toContain("Found two windows:");
    expect(labels(message)).toEqual([["+ Tomorrow 10:00", "+ Fri 11:00"], ["Other time"]]);
  });
});

describe("group views", () => {
  it("never carry a Mini App or copy-text button: nothing in a group may open or export calendar data", () => {
    const messages = [
      groupChooserView({ draftId: "d", title: "x" }, ctx),
      groupPointerView({ startPayload: "g_abc" }, ctx),
      groupSlotsView(
        { task: { id: "t", title: "x" }, slots: [TOMORROW_SLOT, FRIDAY_SLOT, TODAY_SLOT], groupTitle: "Маркетинг" },
        ctx,
      ),
    ];

    for (const message of messages) {
      const kinds = message.keyboard?.flat().map((button) => button.kind) ?? [];
      expect(kinds).not.toContain("web_app");
      expect(kinds).not.toContain("copy_text");
    }
  });
});
