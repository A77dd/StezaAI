import { afterEach, describe, expect, it, vi } from "vitest";
import { createPipelineHarness } from "../../testing/pipelineHarness";
import { ALEX, createGroupChat } from "../../testing/participants";
import { pressRich, richText } from "../../testing/richPress";
import { registerPersonalFlow } from "./index";
import type { Intent } from "../../domain";

afterEach(() => vi.useRealTimers());

async function harness() {
  const h = createPipelineHarness({ composers: [registerPersonalFlow()], failRichMessages: true });
  await h.services.personalFlow.startUser({ userId: String(ALEX.id), locale: "ru" });
  await h.services.personalFlow.setTimezone({ userId: String(ALEX.id), tz: "Europe/Moscow" });
  return h;
}

describe("forwarded messages", () => {
  it("books a clear meeting time and saves the next message as meeting details", async () => {
    const intent: Intent = {
      kind: "meeting", title: "Встреча с Марией", deadline: null, durationMinutes: null,
      scheduledStartAt: "2026-09-25T14:00:00.000Z", meetingUrl: "https://meet.example.test/room",
      priority: "normal", participants: ["Мария"], confidence: 0.95,
    };
    const h = createPipelineHarness({
      composers: [registerPersonalFlow()],
      kit: { startAt: "2026-09-23T08:30:00.000Z" },
      services: { intentParser: { parse: async () => intent } },
    });
    await h.services.personalFlow.startUser({ userId: String(ALEX.id), locale: "ru" });
    await h.services.personalFlow.setTimezone({ userId: String(ALEX.id), tz: "Europe/Moscow" });

    await h.deliver(h.kit.updates.forwardedText("Давайте согласуем встречу в пятницу в 17:00 https://meet.example.test/room", { kind: "user", user: ALEX }));

    const task = (await h.services.tasks.listByUser(String(ALEX.id)))[0];
    expect(task).toMatchObject({ status: "scheduled", title: "Встреча с Марией", meetingUrl: "https://meet.example.test/room" });
    expect(richText(h.kit.fake.callsTo("sendRichMessage")[0]!)).toContain("Если хотите добавить контекст");
    // The meeting link is a url button inside the rich body.
    expect((h.kit.fake.callsTo("sendRichMessage")[0]!.payload.rich_message as { html: string }).html).toContain('type="url"');
    expect(h.services.promptTracker.peek(String(ALEX.id), ALEX.id)).toMatchObject({ purpose: "meeting_details" });

    await pressRich(h, ALEX.id, "☑ Напомнить за час");
    await expect(h.services.tasks.get(String(ALEX.id), task!.id)).resolves.toMatchObject({ meetingReminderEnabled: false });
    await expect(h.services.reminders.exportForUser(String(ALEX.id))).resolves.toMatchObject([{ status: "cancelled" }]);

    await h.deliver(h.kit.updates.privateText("Обсудить план запуска", { from: ALEX }));

    await expect(h.services.tasks.get(String(ALEX.id), task!.id)).resolves.toMatchObject({ description: "Обсудить план запуска" });
    expect(h.kit.fake.callsTo("editMessageText")).toHaveLength(2);
  });

  it("sends the no-details follow-up silently after five minutes", async () => {
    vi.useFakeTimers();
    const intent: Intent = {
      kind: "meeting", title: "Встреча", deadline: null, durationMinutes: 60,
      scheduledStartAt: "2026-09-25T14:00:00.000Z", priority: "normal", participants: [], confidence: 0.95,
    };
    const h = createPipelineHarness({
      composers: [registerPersonalFlow()],
      kit: { startAt: "2026-09-23T08:30:00.000Z" },
      services: { intentParser: { parse: async () => intent } },
    });
    await h.services.personalFlow.startUser({ userId: String(ALEX.id), locale: "ru" });
    await h.services.personalFlow.setTimezone({ userId: String(ALEX.id), tz: "Europe/Moscow" });
    await h.deliver(h.kit.updates.forwardedText("Встречаемся в пятницу в 17:00", { kind: "hidden_user", name: "Мария" }));

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    const cards = h.kit.fake.callsTo("sendRichMessage");
    expect(cards).toHaveLength(2);
    expect(cards[1]?.payload.disable_notification).toBe(true);
    expect((cards[1]?.payload.rich_message as { html: string }).html).toContain("Не получила дополнительных данных");
    expect((cards[1]?.payload.rich_message as { html: string }).html).toContain("Не удалось получить @username отправителя");
  });
  it("re-arms details capture when the button on the follow-up card is pressed", async () => {
    vi.useFakeTimers();
    const intent: Intent = {
      kind: "meeting", title: "Встреча", deadline: null, durationMinutes: 60,
      scheduledStartAt: "2026-09-25T14:00:00.000Z", priority: "normal", participants: [], confidence: 0.95,
    };
    const h = createPipelineHarness({
      composers: [registerPersonalFlow()],
      kit: { startAt: "2026-09-23T08:30:00.000Z" },
      services: { intentParser: { parse: async () => intent } },
    });
    await h.services.personalFlow.startUser({ userId: String(ALEX.id), locale: "ru" });
    await h.services.personalFlow.setTimezone({ userId: String(ALEX.id), tz: "Europe/Moscow" });
    await h.deliver(h.kit.updates.forwardedText("Встречаемся в пятницу в 17:00", { kind: "hidden_user", name: "Мария" }));
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    // The quiet follow-up card carries the "Добавить информацию" button.
    const nudgeCard = h.kit.fake.messages.last(ALEX.id)!.message;
    await pressRich(h, ALEX.id, "Добавить информацию");
    expect(h.kit.fake.callsTo("answerCallbackQuery").at(-1)?.payload.text).toContain("отправьте следующим сообщением");
    expect(h.services.promptTracker.peek(String(ALEX.id), ALEX.id)).toMatchObject({
      purpose: "meeting_details", promptMessageId: nudgeCard.message_id,
    });

    // The next message lands in the meeting description, on the same card.
    await h.deliver(h.kit.updates.privateText("Обсудить бюджет и риски", { from: ALEX }));
    const task = (await h.services.tasks.listByUser(String(ALEX.id)))[0];
    expect(task?.description).toBe("Обсудить бюджет и риски");
    const edited = h.kit.fake.callsTo("editMessageText").at(-1);
    expect(edited?.payload.chat_id).toBe(ALEX.id);
    expect(edited?.payload.message_id).toBe(nudgeCard.message_id);
  });

  it("routes a visible forward through submitText with original provenance", async () => {
    const h = await harness();
    await h.deliver(h.kit.updates.forwardedText("Посмотри договор до завтра", { kind: "user", user: ALEX }));
    const task = (await h.services.tasks.listByUser(String(ALEX.id)))[0];
    expect(task?.source).toMatchObject({ sourceType: "forwarded_message", sourceChatId: ALEX.id, sourceAuthor: "Alex" });
    expect(h.kit.fake.callsTo("sendMessage")).toHaveLength(1);
  });

  it("does not treat group forwards as private tasks", async () => {
    const h = await harness();
    const update = h.kit.updates.forwardedText("Нужно подготовить отчет", { kind: "user", user: ALEX });
    update.message.chat = createGroupChat();
    await h.deliver(update);
    expect(await h.services.tasks.listByUser(String(ALEX.id))).toHaveLength(0);
  });

  it("combines an out-of-order forwarded album into one submission", async () => {
    vi.useFakeTimers();
    const h = await harness();
    const later = h.kit.updates.forwardedText("подготовить отчет", { kind: "user", user: ALEX }, { messageId: 5 });
    const earlier = h.kit.updates.forwardedText("Нужно", { kind: "user", user: ALEX }, { messageId: 3 });
    later.message.media_group_id = "album-1";
    earlier.message.media_group_id = "album-1";
    await h.deliver(later);
    await h.deliver(earlier);
    expect(await h.services.tasks.listByUser(String(ALEX.id))).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    const tasks = await h.services.tasks.listByUser(String(ALEX.id));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.source).toMatchObject({ sourceMessageId: 3, relatedMessageIds: [5], sourceText: "Нужно\nподготовить отчет" });
  });
});
