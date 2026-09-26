import { describe, expect, it } from "vitest";
import { FRIDAY_SLOT, makeEnViewContext, makeViewContext, SLOT_HTML, TODAY_SLOT, TOMORROW_SLOT } from "../../testing/viewFixtures";
import { RenderError } from "../errors";
import { eventCard, reminderCard, slotListCard } from "./inlineCards";

const ctx = makeViewContext();

describe("slotListCard", () => {
  it("lists free windows as a shareable text card", () => {
    const card = slotListCard({ slots: [TOMORROW_SLOT, FRIDAY_SLOT] }, ctx);

    expect(card).toEqual({
      title: "Свободное время",
      description: "чт, 10:00–11:00; пт, 11:00–12:00",
      message: {
        kind: "text",
        text: `<b>Свободное время</b>\n\n• ${SLOT_HTML.tomorrow}\n• ${SLOT_HTML.friday}`,
        parseMode: "HTML",
        linkPreview: "disabled",
        keyboard: null,
      },
    });
  });

  it("says when nothing is free", () => {
    const card = slotListCard({ slots: [] }, ctx);

    expect(card.description).toBe("Свободных окон не нашлось.");
    expect(card.message.text).toBe("<b>Свободное время</b>\n\nСвободных окон не нашлось.");
  });

  it("accepts up to five windows and rejects more", () => {
    expect(() => slotListCard({ slots: Array(5).fill(TODAY_SLOT) }, ctx)).not.toThrow();
    expect(() => slotListCard({ slots: Array(6).fill(TODAY_SLOT) }, ctx)).toThrow(RenderError);
  });
});

describe("eventCard", () => {
  it("shows the meeting, when and with whom", () => {
    const card = eventCard({ title: "обсудить бюджет", slot: TOMORROW_SLOT, participants: ["Сергей", "Анна"] }, ctx);

    expect(card).toEqual({
      title: "Встреча: обсудить бюджет",
      description: "чт, 10:00–11:00",
      message: {
        kind: "text",
        text: `<b>Встреча: обсудить бюджет</b>\n\n<b>Когда</b>: ${SLOT_HTML.tomorrow}\n<b>С кем</b>: Сергей, Анна`,
        parseMode: "HTML",
        linkPreview: "disabled",
        keyboard: null,
      },
    });
  });

  it("omits the participants line when there are none", () => {
    const card = eventCard({ title: "обсудить бюджет", slot: TOMORROW_SLOT, participants: [] }, ctx);

    expect(card.message.text).not.toContain("С кем");
  });

  it("names the first five participants and counts the rest", () => {
    const names = ["Аня", "Боря", "Вера", "Гена", "Даша", "Егор", "Женя"];
    const card = eventCard({ title: "x", slot: TOMORROW_SLOT, participants: names }, ctx);

    expect(card.message.text).toContain("<b>С кем</b>: Аня, Боря, Вера, Гена, Даша и ещё 2");
  });

  it("escapes and shortens titles and names, in the plain result title too", () => {
    const card = eventCard(
      { title: `<b>x</b> & ${"я".repeat(200)}`, slot: TOMORROW_SLOT, participants: ["<i>Аня</i> & " + "б".repeat(100)] },
      ctx,
    );

    expect(card.message.text).toMatch(/^<b>Встреча: &lt;b&gt;x&lt;\/b&gt; &amp; я+…<\/b>/);
    expect(card.message.text).toMatch(/<b>С кем<\/b>: &lt;i&gt;Аня&lt;\/i&gt; &amp; б+…$/);
    expect(card.title).toMatch(/^Встреча: <b>x<\/b> & я+…$/);
    expect(Array.from(card.title).length).toBeLessThanOrEqual("Встреча: ".length + 120);
  });
});

describe("reminderCard", () => {
  it("shows what to be reminded of and when", () => {
    const card = reminderCard({ title: "обсудить бюджет", at: TOMORROW_SLOT.start }, ctx);

    expect(card).toEqual({
      title: "Напомнить: обсудить бюджет",
      description: "чт, 10:00",
      message: {
        kind: "text",
        text: '<b>Напомнить: обсудить бюджет</b>\n\n<b>Когда</b>: <tg-time unix="1790233200" format="wDt">чт, 10:00</tg-time>',
        parseMode: "HTML",
        linkPreview: "disabled",
        keyboard: null,
      },
    });
  });
});

describe("inline cards in English", () => {
  it("speaks English", () => {
    const en = makeEnViewContext();

    expect(slotListCard({ slots: [TOMORROW_SLOT] }, en).title).toBe("Free time");
    expect(eventCard({ title: "budget", slot: TOMORROW_SLOT, participants: [] }, en).title).toBe("Meeting: budget");
    expect(reminderCard({ title: "budget", at: TOMORROW_SLOT.start }, en).description).toBe("Thu, 10:00");
    expect(reminderCard({ title: "budget", at: TOMORROW_SLOT.start }, en).title).toBe("Reminder: budget");
  });
});
