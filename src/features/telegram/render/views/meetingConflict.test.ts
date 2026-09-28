import { describe, expect, it } from "vitest";
import { makeSource, makeTask } from "../../testing/domainFixtures";
import { makeViewContext } from "../../testing/viewFixtures";
import { meetingConflictRichView, meetingNegotiationRichView } from "./meeting";

const ctx = makeViewContext();
const REQUESTED = { start: "2026-09-25T14:00:00.000Z", end: "2026-09-25T15:00:00.000Z" }; // 17:00–18:00 Moscow
const EXISTING = { start: "2026-09-25T13:30:00.000Z", end: "2026-09-25T14:30:00.000Z" }; // 16:30–17:30 Moscow
const PROPOSED = { start: "2026-09-25T15:00:00.000Z", end: "2026-09-25T16:00:00.000Z" }; // 18:00–19:00 Moscow

function conflictView(busy: readonly { start: string; end: string; title?: string; taskId?: string }[]) {
  const task = makeTask({ id: "task_1", kind: "meeting", title: "Встреча с Марией", status: "proposed", source: makeSource({ sourceAuthorUsername: "maria" }) });
  return meetingConflictRichView({ task, requested: REQUESTED, busy, proposalSlots: [PROPOSED] }, ctx);
}

describe("meetingConflictRichView: the shared timeline", () => {
  it("renders both events as table bars over the same window with ticks", () => {
    const view = conflictView([{ ...EXISTING, title: "Обзор плана" }]);
    const html = view.html;

    expect(view.kind).toBe("rich_html");
    expect(html).toContain("<table>");
    // The colliding window 16:00–18:00: the existing bar is offset by one
    // half-hour column and spans two, with the row sums equal to the ticks'.
    expect(html).toContain('<td colspan="1"></td><td colspan="2">Обзор плана · 16:30–17:30</td><td colspan="1"></td>');
    expect(html).toContain(">16:00<");
    expect(html).toContain(">18:00<");
    // The proposed alternative is described in text, not on the timeline.
    expect(html).not.toContain("Встреча с Марией · 18:00–19:00");
  });

  it("labels the colliding event 'Занято' when the calendar returned no name", () => {
    const view = conflictView([{ start: EXISTING.start, end: EXISTING.end }]);
    expect(view.html).toContain("Занято · 16:30–17:30");
    expect(view.html).not.toContain("Уже в календаре: Обзор плана");
    expect(view.html).toContain("Уже в календаре: Занято");
  });

  it("offers the proposed slot, other slots, keeping both — and the move only for own meetings", () => {
    const withOwn = conflictView([{ ...EXISTING, title: "Обзор плана", taskId: "task_9" }]);
    expect(withOwn.html).toContain("Поставить встречу на 18:00–19:00");
    expect(withOwn.html).toContain("Посмотреть другие свободные слоты");
    expect(withOwn.html).toContain("Оставить оба события как есть");
    expect(withOwn.html).toContain("Перенести «Обзор плана» на 18:00–19:00?");

    const external = conflictView([{ start: EXISTING.start, end: EXISTING.end }]);
    expect(external.html).not.toContain("Перенести");
  });
});

describe("meetingNegotiationRichView", () => {
  it("suggests the phrase with native copy and a chat link, never sending it", () => {
    const task = makeTask({ id: "task_1", kind: "meeting", source: makeSource({ sourceAuthorUsername: "maria" }) });
    void task;
    const view = meetingNegotiationRichView(
      {
        headline: "Встреча добавлена на 18:00–19:00.",
        requested: REQUESTED,
        suggested: PROPOSED,
        username: "maria",
      },
      ctx,
    );
    expect(view.html).toContain("Вам подойдёт 18:00–19:00?");
    // Native copy through the officially supported copy_text button.
    expect(view.html).toContain('type="copy_text"');
    expect(view.html).toContain("Скопировать текст");
    expect(view.html).toContain('type="url" url="https://t.me/maria"');
  });

  it("falls back to the keep-phrase when nothing was booked", () => {
    const view = meetingNegotiationRichView(
      { headline: "Встречу не ставлю.", requested: REQUESTED, suggested: null, username: null },
      ctx,
    );
    expect(view.html).toContain("Давайте подберём другое время?");
    expect(view.html).not.toContain("t.me/");
  });
});
