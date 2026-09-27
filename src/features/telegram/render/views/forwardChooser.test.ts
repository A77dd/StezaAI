import { describe, expect, it } from "vitest";
import {
  expectValidKeyboard,
  FRIDAY_SLOT,
  labels,
  makeEnViewContext,
  makeViewContext,
  SLOT_HTML,
  TOMORROW_SLOT,
} from "../../testing/viewFixtures";
import { RenderError } from "../errors";
import { forwardChooserView } from "./forwardChooser";
import type { ForwardChooserInput } from "./forwardChooser";

const ctx = makeViewContext();
const source = {
  sourceText: "Давай обсудим маркетинговый план на этой неделе?",
  sourceAuthor: "Сергей",
  hiddenOrigin: false,
};
const meeting: ForwardChooserInput = {
  draftId: "draft_1",
  kind: "meeting",
  title: "обсуждение маркетингового плана",
  source,
  alternatives: ["task", "info"],
  proposal: { taskId: "task_9", slots: [TOMORROW_SLOT, FRIDAY_SLOT] },
};

describe("forwardChooserView: scheduling kinds", () => {
  it("says what it understood, lists free time, quotes the source and offers day buttons", () => {
    const message = forwardChooserView(meeting, ctx);

    expect(message).toEqual({
      kind: "text",
      text:
        "Похоже, нужно запланировать «обсуждение маркетингового плана».\n\n" +
        "У тебя свободно:\n" +
        `• ${SLOT_HTML.tomorrow}\n` +
        `• ${SLOT_HTML.friday}\n\n` +
        "<blockquote expandable><b>От: Сергей</b>\nДавай обсудим маркетинговый план на этой неделе?</blockquote>",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [
        [
          { kind: "action", text: "Завтра 10:00", action: "slot.pick", payload: { taskId: "task_9", slotIndex: 0, slotStart: TOMORROW_SLOT.start, slotEnd: TOMORROW_SLOT.end }, style: "success" },
          { kind: "action", text: "Пт 11:00", action: "slot.pick", payload: { taskId: "task_9", slotIndex: 1, slotStart: FRIDAY_SLOT.start, slotEnd: FRIDAY_SLOT.end }, style: "success" },
        ],
        [{ kind: "action", text: "Другое время", action: "slot.other", payload: { taskId: "task_9" } }],
        [
          { kind: "action", text: "Это задача", action: "intent.choose", payload: { draftId: "draft_1", kind: "task" } },
          { kind: "action", text: "Просто запомнить", action: "intent.choose", payload: { draftId: "draft_1", kind: "info" } },
        ],
      ],
    });
    expectValidKeyboard(message);
  });

  it.each([
    ["task", "Похоже, это задача: «X»."],
    ["reminder", "Похоже, нужно не забыть про «X»."],
    ["follow_up", "Похоже, нужно ответить по теме «X»."],
  ] as const)("has its own wording for %s", (kind, sentence) => {
    const message = forwardChooserView({ ...meeting, kind, title: "X" } as ForwardChooserInput, ctx);

    expect(message.kind === "text" && message.text.startsWith(sentence)).toBe(true);
  });

  it("never offers the current reading as an alternative", () => {
    const message = forwardChooserView({ ...meeting, alternatives: ["meeting", "task", "task"] }, ctx);

    expect(labels(message).at(-1)).toEqual(["Это задача"]);
  });

  it("without free windows says so and still offers to pick a time", () => {
    const message = forwardChooserView({ ...meeting, alternatives: [], proposal: { taskId: "task_9", slots: [] } }, ctx);

    expect(message.kind === "text" && message.text).toContain(
      "Свободных окон пока не нашёл. Можно выбрать время вручную.",
    );
    expect(labels(message)).toEqual([["Другое время"]]);
  });

  it("marks a hidden origin without naming anyone", () => {
    const message = forwardChooserView({ ...meeting, source: { ...source, hiddenOrigin: true } }, ctx);

    expect(message.kind === "text" && message.text).toContain("<b>Пересланное сообщение</b>");
    expect(message.kind === "text" && message.text).not.toContain("Сергей");
  });

  it("names no author when there is none", () => {
    const message = forwardChooserView({ ...meeting, source: { ...source, sourceAuthor: null } }, ctx);

    expect(message.kind === "text" && message.text).toContain("<blockquote expandable><b>Пересланное сообщение</b>");
  });

  it.each(["", "   ", " \n\t "])("treats the blank author %j like a missing one", (sourceAuthor) => {
    const message = forwardChooserView({ ...meeting, source: { ...source, sourceAuthor } }, ctx);

    expect(message.kind === "text" && message.text).toContain("<blockquote expandable><b>Пересланное сообщение</b>");
  });

  it("omits the quote for a blank source text", () => {
    const message = forwardChooserView({ ...meeting, source: { ...source, sourceText: " \n " } }, ctx);

    expect(message.kind === "text" && message.text).not.toContain("blockquote");
  });
});

describe("forwardChooserView: information", () => {
  const info: ForwardChooserInput = {
    draftId: "draft_2",
    kind: "info",
    title: "Договор подписан 12 сентября",
    source,
    alternatives: ["task", "meeting", "info"],
  };

  it("asks whether to remember it, with the promise to save only after confirmation", () => {
    const message = forwardChooserView(info, ctx);

    expect(message).toEqual({
      kind: "text",
      text:
        "Здесь нет задачи, это скорее информация: «Договор подписан 12 сентября». Запомнить?\n\n" +
        "<blockquote expandable><b>От: Сергей</b>\nДавай обсудим маркетинговый план на этой неделе?</blockquote>\n\n" +
        "<i>Сохраню только после твоего подтверждения.</i>",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [
        [{ kind: "action", text: "Запомнить", action: "context.choose", payload: { draftId: "draft_2", choice: "remember" }, style: "success" }],
        [
          { kind: "action", text: "Это задача", action: "intent.choose", payload: { draftId: "draft_2", kind: "task" } },
          { kind: "action", text: "Это встреча", action: "intent.choose", payload: { draftId: "draft_2", kind: "meeting" } },
        ],
      ],
    });
    expectValidKeyboard(message);
  });
});

describe("forwardChooserView: user text and English", () => {
  it("escapes and shortens the source text and author", () => {
    const message = forwardChooserView(
      {
        ...meeting,
        source: { sourceText: `<b>X</b> &amp; </blockquote>${"я".repeat(500)}`, sourceAuthor: "<i>Мэл</i> & Co", hiddenOrigin: false },
      },
      ctx,
    );
    const text = message.kind === "text" ? message.text : "";

    expect(text).toContain("<b>От: &lt;i&gt;Мэл&lt;/i&gt; &amp; Co</b>");
    expect(text).toContain("&lt;b&gt;X&lt;/b&gt; &amp;amp; &lt;/blockquote&gt;");
    expect(text).toMatch(/я+…<\/blockquote>/);
  });

  it("speaks English", () => {
    const message = forwardChooserView(meeting, makeEnViewContext());

    expect(message.kind === "text" && message.text.startsWith("Looks like “обсуждение маркетингового плана” needs scheduling.\n\nYou are free:")).toBe(true);
    expect(labels(message)).toEqual([["Tomorrow 10:00", "Fri 11:00"], ["Other time"], ["It is a task", "Just remember"]]);
  });

  it("rejects an empty title", () => {
    expect(() => forwardChooserView({ ...meeting, title: "  " }, ctx)).toThrow(RenderError);
  });
});
