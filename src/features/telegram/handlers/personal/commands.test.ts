import { describe, expect, it } from "vitest";
import { ALEX } from "../../testing/participants";
import { createPipelineHarness } from "../../testing/pipelineHarness";
import type { RecordedCall } from "../../testing/fakeBotApi";
import { expectCall, expectRenderedText } from "../../testing/assertions";
import { pressRich } from "../../testing/richPress";
import { registerPersonalFlow } from "./index";

const USER_ID = String(ALEX.id);
const CHAT_ID = ALEX.id;

function makeHarness() {
  return createPipelineHarness({ composers: [registerPersonalFlow()], failRichMessages: true });
}

function buttonLabels(call: RecordedCall): string[] {
  const markup = call.payload.reply_markup as { inline_keyboard: { text: string }[][] } | undefined;
  return (markup?.inline_keyboard ?? []).flat().map((button) => button.text);
}

describe("personal flow: commands", () => {
  it("/start sends the welcome message with the expected quick actions", async () => {
    const h = makeHarness();

    await h.deliver(h.kit.updates.command("start", undefined, { from: ALEX }));

    const sent = expectCall(h.kit, "sendRichMessage", { chat_id: CHAT_ID });
    const html = (sent.payload.rich_message as { html: string }).html;
    expect(html).toContain("Привет, Alex!");
    // Quick actions are buttons INSIDE the rich body now.
    expect(html).toContain(">📅 Подключить календарь</tg-button>");
    expect(html).toContain(">⚙️ Настроить профиль</tg-button>");
    expect(html).toContain("tg-slideshow");
    // The legal footer with two underlined placeholder links.
    expect(html).toContain("<footer>");
    expect(html).toContain('href="https://t.me/steza_test_bot"');

    const settings = await h.services.settings.get(USER_ID);
    expect(settings?.timezoneConfirmed).toBe(false);
  });

  it("/demo_calendar opens the interactive rich calendar with bookable sample slots", async () => {
    // The demos ARE the rich scenarios: a plain harness, no rich-failure injection.
    const h = createPipelineHarness({ composers: [registerPersonalFlow()] });

    await h.deliver(h.kit.updates.command("demo_calendar", undefined, { from: ALEX }));

    const sent = expectCall(h.kit, "sendRichMessage", { chat_id: CHAT_ID });
    const html = (sent.payload.rich_message as { html: string }).html;
    expect(html).toContain("Демо: подготовить отчёт");
    // A day button opens the day view with the sample slot.
    await pressRich(h, CHAT_ID, /^\d+/);
    const day = expectCall(h.kit, "editMessageText", { chat_id: CHAT_ID });
    expect((day.payload.rich_message as { html: string }).html).toContain(":00");
    // Booking the slot lands the task as scheduled.
    await pressRich(h, CHAT_ID, /–/);
    const task = (await h.services.tasks.listByUser(USER_ID))[0];
    expect(task?.status).toBe("scheduled");
  });

  it("/demo_meeting books a sample meeting with the interactive rich card", async () => {
    const h = createPipelineHarness({ composers: [registerPersonalFlow()] });

    await h.deliver(h.kit.updates.command("demo_meeting", undefined, { from: ALEX }));

    const sent = expectCall(h.kit, "sendRichMessage", { chat_id: CHAT_ID });
    const html = (sent.payload.rich_message as { html: string }).html;
    expect(html).toContain("Демо: встреча с командой");
    expect(html).toContain(">☑ Напомнить за час</tg-button>");
    expect(html).toContain(">Изменить время</tg-button>");
    const task = (await h.services.tasks.listByUser(USER_ID))[0];
    expect(task).toMatchObject({ status: "scheduled", kind: "meeting" });

    // "Изменить время" opens the busy-aware reschedule calendar.
    await pressRich(h, CHAT_ID, "Изменить время");
    const calendarCall = h.kit.fake.callsTo("sendRichMessage").at(-1);
    if (calendarCall === undefined) throw new Error("the reschedule calendar was not sent");
    const calendarHtml = (calendarCall.payload.rich_message as { html: string }).html;
    expect(calendarHtml).toContain("Когда провести встречу?");
    expect(calendarHtml).toContain("Напишите новую дату и время встречи");
  });

  it("/demo_meeting is idempotent enough: a second run books a different hour, not a conflict failure", async () => {
    const h = createPipelineHarness({ composers: [registerPersonalFlow()] });
    await h.deliver(h.kit.updates.command("demo_meeting", undefined, { from: ALEX }));
    await h.deliver(h.kit.updates.command("demo_meeting", undefined, { from: ALEX }));

    const tasks = await h.services.tasks.listByUser(USER_ID);
    expect(tasks).toHaveLength(2);
    expect(tasks.every((t) => t.status === "scheduled")).toBe(true);
  });

  it("/demo_conflict shows the conflict card without changing the user's calendar", async () => {
    const h = createPipelineHarness({ composers: [registerPersonalFlow()] });

    await h.deliver(h.kit.updates.command("demo_conflict", undefined, { from: ALEX }));

    const sent = expectCall(h.kit, "sendRichMessage", { chat_id: CHAT_ID });
    const html = (sent.payload.rich_message as { html: string }).html;
    expect(html).toContain("В это время уже есть событие");
    expect(html).toContain("Новая встреча");
    expect(html).toContain("Обзор плана");
    expect(html).toContain("Демо: календарь не изменится");
    expect(html).toContain('type="disabled"');
    expect(html).not.toContain('type="callback_data"');
    expect(await h.services.tasks.listByUser(USER_ID)).toHaveLength(0);
    expect(await h.services.calendar.getBusyIntervals(USER_ID, {
      start: "2026-09-23T00:00:00.000Z",
      end: "2026-09-24T00:00:00.000Z",
    })).toHaveLength(0);
  });

  it("/start with a deep-link payload still starts the user (ctx.match is accepted, not required)", async () => {
    const h = makeHarness();

    await h.deliver(h.kit.updates.command("start", "today", { from: ALEX }));

    expectCall(h.kit, "sendMessage", { chat_id: CHAT_ID });
    expect(await h.services.settings.get(USER_ID)).not.toBeNull();
  });

  it("/help goes out as a Rich Message and lists only the commands this task implements", async () => {
    const h = makeHarness();

    await h.deliver(h.kit.updates.command("help", undefined, { from: ALEX }));

    const sent = expectCall(h.kit, "sendRichMessage", { chat_id: CHAT_ID });
    const markdown = (sent.payload.rich_message as { markdown: string }).markdown;
    expect(markdown).toContain("# Что я умею");
    expect(markdown).toContain("- /start —");
    expect(markdown).toContain("- /settings —");
    expect(markdown).toContain("- /export —");
    expect(markdown).toContain("- /deleteme —");
    expect(markdown).not.toContain("/today");
    expect(markdown).not.toContain("/week");
  });

  it("/settings renders the settings card with toggle buttons", async () => {
    const h = makeHarness();

    await h.deliver(h.kit.updates.command("settings", undefined, { from: ALEX }));

    const sent = expectCall(h.kit, "sendMessage", { chat_id: CHAT_ID });
    expect(expectRenderedText(sent)).toContain("Настройки");
    expect(buttonLabels(sent)).toContain("Изменить рабочие часы");
  });

  it("/export sends a JSON document with the user's data", async () => {
    const h = makeHarness();
    await h.services.personalFlow.startUser({ userId: USER_ID, locale: "ru" });

    await h.deliver(h.kit.updates.command("export", undefined, { from: ALEX }));

    const document = h.kit.fake.sentDocument(CHAT_ID);
    expect(document?.fileName).toBe("steza-export.json");
    expect(document?.mimeType).toBe("application/json");
    const data = JSON.parse(document?.text ?? "{}") as { schemaVersion: number; settings: { userId: string } | null };
    expect(data.schemaVersion).toBe(1);
    expect(data.settings?.userId).toBe(USER_ID);
  });

  it("/deleteme asks for confirmation and only deletes after confirming", async () => {
    const h = makeHarness();
    await h.services.personalFlow.startUser({ userId: USER_ID, locale: "ru" });

    await h.deliver(h.kit.updates.command("deleteme", undefined, { from: ALEX }));
    const confirmCard = h.kit.fake.messages.last(CHAT_ID)!.message;
    expect(expectRenderedText(h.kit.fake.lastCall("sendMessage")!)).toContain("Удалить все мои данные?");

    // Settings must still exist before confirmation.
    expect(await h.services.settings.get(USER_ID)).not.toBeNull();

    const press = await h.kit.press(h.bot, confirmCard, { text: "Да, удалить" });

    expect(await h.services.settings.get(USER_ID)).toBeNull();
    expectCall(h.kit, "editMessageText", {
      chat_id: CHAT_ID,
      message_id: confirmCard.message_id,
      text: "Данные удалены.",
    });
    expect(h.kit.fake.answeredCallbackIds).toContain(press.callback_query.id);
  });

  it("/deleteme cancelled leaves the data untouched", async () => {
    const h = makeHarness();
    await h.services.personalFlow.startUser({ userId: USER_ID, locale: "ru" });

    await h.deliver(h.kit.updates.command("deleteme", undefined, { from: ALEX }));
    const confirmCard = h.kit.fake.messages.last(CHAT_ID)!.message;

    await h.kit.press(h.bot, confirmCard, { text: "Отмена" });

    expect(await h.services.settings.get(USER_ID)).not.toBeNull();
    expectCall(h.kit, "editMessageText", {
      chat_id: CHAT_ID,
      message_id: confirmCard.message_id,
      text: "Отменено, данные не удалены.",
    });
  });
});
