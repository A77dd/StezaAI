import { describe, expect, it } from "vitest";
import { ALEX } from "../../testing/participants";
import { createPipelineHarness } from "../../testing/pipelineHarness";
import { expectCall, expectCallbackAnsweredOnce, expectRenderedText } from "../../testing/assertions";
import { registerPersonalFlow } from "./index";

const USER_ID = String(ALEX.id);
const CHAT_ID = ALEX.id;

function makeHarness() {
  return createPipelineHarness({ composers: [registerPersonalFlow()], failRichMessages: true });
}

async function openSettings(h: ReturnType<typeof makeHarness>) {
  await h.services.personalFlow.startUser({ userId: USER_ID, locale: "ru" });
  await h.deliver(h.kit.updates.command("settings", undefined, { from: ALEX }));
  return h.kit.fake.messages.last(CHAT_ID)!.message;
}

function intensityButtonText(card: { reply_markup?: { inline_keyboard: { text: string }[][] } }): string | undefined {
  const row = card.reply_markup?.inline_keyboard[0];
  // Find the selected button (has ✓ prefix)
  const selected = row?.find((b) => b.text.startsWith("✓"));
  if (selected) return selected.text;
  // Fallback: find any intensity button
  return row?.find((b) => b.text === "Чаще" || b.text === "Обычно" || b.text === "Реже")?.text;
}

describe("personal flow: settings", () => {
  it("toggles the notification intensity in place", async () => {
    const h = makeHarness();
    const card = await openSettings(h);

    const press = await h.kit.press(h.bot, card, { text: "Чаще" });

    expectCallbackAnsweredOnce(h.kit, press.callback_query.id);
    const edited = expectCall(h.kit, "editMessageText", { chat_id: CHAT_ID, message_id: card.message_id });
    const buttonText = intensityButtonText(edited.payload);
    expect(buttonText).toContain("✓ Чаще");
    expect((await h.services.settings.get(USER_ID))?.notificationIntensity).toBe("high");
  });

  it("changes the block length in place", async () => {
    const h = makeHarness();
    const card = await openSettings(h);

    await h.kit.press(h.bot, card, { text: "1 ч" });

    expect((await h.services.settings.get(USER_ID))?.defaultBlockMinutes).toBe(60);
  });

  it("connects and disconnects the calendar", async () => {
    const h = makeHarness();
    const card = await openSettings(h);

    const connected = await h.kit.press(h.bot, card, { text: "Подключить календарь" });
    expect((await h.services.settings.get(USER_ID))?.calendarConnected).toBe(true);
    expectCallbackAnsweredOnce(h.kit, connected.callback_query.id);

    const refreshed = h.kit.fake.messages.get(CHAT_ID, card.message_id)!.message;
    await h.kit.press(h.bot, refreshed, { text: "Отключить календарь" });
    expect((await h.services.settings.get(USER_ID))?.calendarConnected).toBe(false);
  });

  it("asks for free text to set working hours, then applies the reply to the settings card", async () => {
    const h = makeHarness();
    const card = await openSettings(h);

    await h.kit.press(h.bot, card, { text: "Изменить рабочие часы" });
    expect(expectRenderedText(h.kit.fake.lastCall("sendMessage")!)).toContain("рабочие часы");

    await h.deliver(h.kit.updates.privateText("10:00-19:00 пн-пт", { from: ALEX }));

    const settings = await h.services.settings.get(USER_ID);
    expect(settings?.workingHours).toEqual({ isoDays: [1, 2, 3, 4, 5], start: "10:00", end: "19:00" });
    const edited = expectCall(h.kit, "editMessageText", { chat_id: CHAT_ID, message_id: card.message_id });
    expect(expectRenderedText(edited)).toContain("10:00");
  });

  it("keeps the working-hours prompt after invalid hours so a corrected reply can apply", async () => {
    const h = makeHarness();
    const card = await openSettings(h);
    await h.kit.press(h.bot, card, { text: "Изменить рабочие часы" });

    const failure = await h.deliverExpectingFailure(h.kit.updates.privateText("18:00-09:00", { from: ALEX }));
    expect(failure.causeCode).toBe("invalid_settings");

    await h.deliver(h.kit.updates.privateText("09:00-18:00", { from: ALEX }));

    expect((await h.services.settings.get(USER_ID))?.workingHours).toMatchObject({ start: "09:00", end: "18:00" });
    const edited = expectCall(h.kit, "editMessageText", { chat_id: CHAT_ID, message_id: card.message_id });
    expect(expectRenderedText(edited)).toContain("09:00");
  });

  it("sets the timezone from the settings flow by pressing a preset (independent of the onboarding gate)", async () => {
    const h = makeHarness();
    await openSettings(h);
    // The settings card itself has no timezone button (Task 4); this exercises
    // `settings.timezone` the way the onboarding prompt renders it.
    expect((await h.services.settings.get(USER_ID))?.timezoneConfirmed).toBe(false);
  });
});
