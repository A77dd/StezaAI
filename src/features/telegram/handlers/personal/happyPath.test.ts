import { describe, expect, it } from "vitest";
import { createInMemoryCalendar, createSlotScheduler } from "../../adapters";
import { createSequentialIdGenerator } from "../../adapters/idGenerator";
import { ALEX } from "../../testing/participants";
import { createPipelineHarness } from "../../testing/pipelineHarness";
import { expectCall, expectCallbackAnsweredOnce, expectRenderedText } from "../../testing/assertions";
import { registerPersonalFlow } from "./index";

const TASK_TEXT = "Нужно до пятницы подготовить презентацию, часа на два";
const USER_ID = String(ALEX.id);
const CHAT_ID = ALEX.id;

function makeHarness() {
  return createPipelineHarness({ composers: [registerPersonalFlow()] });
}

function makeFlakyCalendar() {
  const calendar = createInMemoryCalendar({ ids: createSequentialIdGenerator() });
  let failNextCreate = true;
  return {
    ...calendar,
    async createBlock(input: Parameters<typeof calendar.createBlock>[0]) {
      if (failNextCreate) {
        failNextCreate = false;
        throw new Error("transient calendar failure");
      }
      return calendar.createBlock(input);
    },
  };
}

async function confirmTimezone(h: ReturnType<typeof makeHarness>): Promise<void> {
  await h.services.personalFlow.startUser({ userId: USER_ID, locale: "ru" });
  await h.services.personalFlow.setTimezone({ userId: USER_ID, tz: "Europe/Moscow" });
}

function lastSlotButtonData(message: { reply_markup?: { inline_keyboard: { callback_data?: string }[][] } }): string {
  const row = message.reply_markup?.inline_keyboard[0];
  const button = row?.[row.length - 1];
  if (button?.callback_data === undefined) {
    throw new Error(`expected a slot button on the proposal card: ${JSON.stringify(message.reply_markup?.inline_keyboard)}`);
  }
  return button.callback_data;
}

describe("personal flow: the core scenario (private text -> proposal -> confirmed slot)", () => {
  it("proposes 1-3 slots, then books the pressed one, edits the same card and schedules reminders", async () => {
    const h = makeHarness();
    await confirmTimezone(h);

    await h.deliver(h.kit.updates.privateText(TASK_TEXT, { from: ALEX }));

    const sent = expectCall(h.kit, "sendMessage", { chat_id: CHAT_ID });
    expect(expectRenderedText(sent)).toContain("Подготовить презентацию");
    const card = h.kit.fake.messages.last(CHAT_ID)!.message;
    const slotButtons = card.reply_markup!.inline_keyboard[0];
    expect(slotButtons.length).toBeGreaterThanOrEqual(1);
    expect(slotButtons.length).toBeLessThanOrEqual(3);

    const press = await h.kit.press(h.bot, card, { data: lastSlotButtonData(card as { reply_markup?: { inline_keyboard: { callback_data?: string }[][] } }) });

    const edited = expectCall(h.kit, "editMessageText", { chat_id: CHAT_ID, message_id: card.message_id });
    expect(expectRenderedText(edited)).toContain("Подготовить презентацию");
    expect(expectRenderedText(edited)).toContain("Когда");
    expectCallbackAnsweredOnce(h.kit, press.callback_query.id);

    const task = (await h.services.tasks.listByUser(USER_ID))[0];
    expect(task?.status).toBe("scheduled");
    expect(task?.bookingId).not.toBeNull();

    const reminders = await h.services.reminders.exportForUser(USER_ID);
    expect(reminders.map((reminder) => reminder.kind).sort()).toEqual(["block_start", "check_in"]);
    expect(reminders.every((reminder) => reminder.status === "pending")).toBe(true);
  });

  it("double-pressing the same slot concurrently books exactly once, with no crash and no duplicate reminder", async () => {
    const h = makeHarness();
    await confirmTimezone(h);
    await h.deliver(h.kit.updates.privateText(TASK_TEXT, { from: ALEX }));
    const card = h.kit.fake.messages.last(CHAT_ID)!.message;
    const data = lastSlotButtonData(card as { reply_markup?: { inline_keyboard: { callback_data?: string }[][] } });

    // Two presses of the SAME button data: each carries its own callback query
    // id (as two rapid taps would), but the callback token itself is
    // single-use, so exactly one succeeds; the other hits
    // `CallbackReplayedError`, which the pipeline turns into a failed update
    // (logged, callback answered with the generic notice, then rethrown to
    // the runtime) — an explicit, observable outcome, never a silent one and
    // never a crash of the process.
    const outcomes = await Promise.allSettled([
      h.kit.press(h.bot, card, { data }),
      h.kit.press(h.bot, card, { data }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);

    const tasks = await h.services.tasks.listByUser(USER_ID);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.status).toBe("scheduled");

    const reminders = await h.services.reminders.exportForUser(USER_ID);
    expect(reminders.filter((reminder) => reminder.kind === "check_in")).toHaveLength(1);
    expect(reminders.filter((reminder) => reminder.kind === "block_start")).toHaveLength(1);

    // Both callback queries were answered exactly once (the replayed one with
    // the generic notice as an alert), never left spinning.
    expect(h.kit.fake.callsTo("answerCallbackQuery")).toHaveLength(2);
  });

  it("does not let a stale slot button book a different slot after requesting other times", async () => {
    const h = makeHarness();
    await confirmTimezone(h);
    await h.deliver(h.kit.updates.privateText(TASK_TEXT, { from: ALEX }));
    const original = h.kit.fake.messages.last(CHAT_ID)!.message;
    const staleData = lastSlotButtonData(original as { reply_markup?: { inline_keyboard: { callback_data?: string }[][] } });

    await h.kit.press(h.bot, original, { text: "Другое время" });
    const refreshed = h.kit.fake.messages.get(CHAT_ID, original.message_id)!.message;
    const currentMarkup = structuredClone(refreshed.reply_markup);
    const editsBeforeStalePress = h.kit.fake.callsTo("editMessageText").length;
    await h.deliver(h.kit.updates.callbackQuery(refreshed, staleData));

    expect((await h.services.tasks.listByUser(USER_ID))[0]).toMatchObject({ status: "proposed", bookingId: null });
    expect(h.kit.fake.callsTo("editMessageText")).toHaveLength(editsBeforeStalePress);
    expect(h.kit.fake.messages.get(CHAT_ID, original.message_id)!.message.reply_markup).toEqual(currentMarkup);
    expect(h.kit.fake.lastCall("answerCallbackQuery")?.payload).toMatchObject({
      text: "Эта кнопка недоступна. Попробуй начать заново.",
      show_alert: true,
    });
  });

  it("keeps a fresh actionable proposal when a calendar conflict appears before confirmation", async () => {
    const calendar = createInMemoryCalendar({ ids: createSequentialIdGenerator() });
    const h = createPipelineHarness({ composers: [registerPersonalFlow()], services: { calendar } });
    await confirmTimezone(h);
    await h.deliver(h.kit.updates.privateText(TASK_TEXT, { from: ALEX }));
    const card = h.kit.fake.messages.last(CHAT_ID)!.message;
    const oldData = lastSlotButtonData(card as { reply_markup?: { inline_keyboard: { callback_data?: string }[][] } });
    const proposal = await h.services.proposals.get(USER_ID, "task_1");
    const conflictedSlot = proposal!.slots.at(-1)!;
    calendar.addBusyInterval(USER_ID, conflictedSlot);

    await h.kit.press(h.bot, card, { data: oldData });

    const refreshed = h.kit.fake.messages.get(CHAT_ID, card.message_id)!.message;
    expect(refreshed.reply_markup?.inline_keyboard[0]?.length).toBeGreaterThan(0);
    const freshData = lastSlotButtonData(refreshed as { reply_markup?: { inline_keyboard: { callback_data?: string }[][] } });
    expect(freshData).not.toBe(oldData);
    await h.kit.press(h.bot, refreshed, { data: freshData });
    expect((await h.services.tasks.listByUser(USER_ID))[0]?.status).toBe("scheduled");
  });

  it("re-renders a fresh proposal after a transient calendar failure and reports the failure", async () => {
    const baseScheduler = createSlotScheduler();
    let schedulerCalls = 0;
    const h = createPipelineHarness({
      composers: [registerPersonalFlow()],
      services: {
        calendar: makeFlakyCalendar(),
        scheduler: {
          propose(input) {
            schedulerCalls += 1;
            const result = baseScheduler.propose(input);
            return { ...result, slots: result.slots.slice(0, 1) };
          },
        },
      },
    });
    await confirmTimezone(h);
    await h.deliver(h.kit.updates.privateText(TASK_TEXT, { from: ALEX }));
    const card = h.kit.fake.messages.last(CHAT_ID)!.message;
    expect(card.reply_markup?.inline_keyboard[0]).toHaveLength(1);
    const oldData = lastSlotButtonData(card as { reply_markup?: { inline_keyboard: { callback_data?: string }[][] } });
    const originalSlotLabel = card.reply_markup!.inline_keyboard[0]![0]!.text;

    const failure = await h.deliverExpectingFailure(h.kit.updates.callbackQuery(card, oldData));

    expect(failure.causeCode).toBe("unexpected");
    expect(h.logger.records).toContainEqual(expect.objectContaining({ event: "update.failed" }));
    const edited = expectCall(h.kit, "editMessageText", { chat_id: CHAT_ID, message_id: card.message_id });
    expect(expectRenderedText(edited)).toContain("Подготовить презентацию");
    const refreshed = h.kit.fake.messages.get(CHAT_ID, card.message_id)!.message;
    expect(refreshed.reply_markup?.inline_keyboard[0]).toHaveLength(1);
    expect(refreshed.reply_markup!.inline_keyboard[0]![0]!.text).toBe(originalSlotLabel);
    expect(schedulerCalls).toBe(1);
    const freshData = lastSlotButtonData(refreshed as { reply_markup?: { inline_keyboard: { callback_data?: string }[][] } });
    expect(freshData).not.toBe(oldData);

    await h.kit.press(h.bot, refreshed, { data: freshData });

    expect((await h.services.tasks.listByUser(USER_ID))[0]?.status).toBe("scheduled");
  });

  it("keeps the timezone prompt and original draft after an invalid timezone reply", async () => {
    const h = makeHarness();
    await h.services.personalFlow.startUser({ userId: USER_ID, locale: "ru" });
    await h.deliver(h.kit.updates.privateText(TASK_TEXT, { from: ALEX }));

    const failure = await h.deliverExpectingFailure(h.kit.updates.privateText("Not/A_Real_Zone", { from: ALEX }));
    expect(failure.causeCode).toBe("invalid_timezone");

    await h.deliver(h.kit.updates.privateText("Europe/Moscow", { from: ALEX }));

    expect((await h.services.settings.get(USER_ID))?.timezoneConfirmed).toBe(true);
    const tasks = await h.services.tasks.listByUser(USER_ID);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.source.sourceText).toBe(TASK_TEXT);
  });
});
