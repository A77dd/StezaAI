import { describe, expect, it } from "vitest";
import { createInMemoryCalendar, createSlotScheduler } from "../../adapters";
import { createSequentialIdGenerator } from "../../adapters/idGenerator";
import { ALEX } from "../../testing/participants";
import { createPipelineHarness } from "../../testing/pipelineHarness";
import { expectCall, expectCallbackAnsweredOnce, expectRenderedText } from "../../testing/assertions";
import { lastRichCall, pressRich, richButtons, richText } from "../../testing/richPress";
import { registerPersonalFlow } from "./index";

const TASK_TEXT = "Нужно до пятницы подготовить презентацию, часа на два";
const USER_ID = String(ALEX.id);
const CHAT_ID = ALEX.id;

function makeHarness() {
  return createPipelineHarness({ composers: [registerPersonalFlow()], failRichMessages: true });
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

    // Rich calendar: the first day button opens the first slot's day.
    const oldDayData = richButtons(lastRichCall(h, CHAT_ID)).find((b) => /^\d+/.test(b.label))!.data;
    const proposal = await h.services.proposals.get(USER_ID, "task_1");
    calendar.addBusyInterval(USER_ID, proposal!.slots[0]!);

    await pressRich(h, CHAT_ID, /^\d+/);
    await pressRich(h, CHAT_ID, /–/);

    // The slot was taken: the same message is re-rendered as a rich month
    // view whose day button carries a newly bound token.
    const card = h.kit.fake.messages.last(CHAT_ID)!.message;
    expect(card.rich_message).toBeDefined();
    const freshDayData = richButtons(lastRichCall(h, CHAT_ID)).find((b) => /^\d+/.test(b.label))!.data;
    expect(freshDayData).not.toBe(oldDayData);

    await pressRich(h, CHAT_ID, /^\d+/);
    await pressRich(h, CHAT_ID, /–/);
    expect((await h.services.tasks.listByUser(USER_ID))[0]?.status).toBe("scheduled");
  });

  it("renders the no-slots state when a conflict leaves no later availability", async () => {
    const baseScheduler = createSlotScheduler();
    const calendar = createInMemoryCalendar({ ids: createSequentialIdGenerator() });
    let schedulerCalls = 0;
    const h = createPipelineHarness({
      composers: [registerPersonalFlow()],
      services: {
        calendar,
        scheduler: {
          propose(input) {
            schedulerCalls += 1;
            const result = baseScheduler.propose(input);
            return schedulerCalls === 1
              ? result
              : { ...result, slots: [], exhausted: "none_before_deadline" as const };
          },
        },
      },
    });
    await confirmTimezone(h);
    await h.deliver(h.kit.updates.privateText(TASK_TEXT, { from: ALEX }));
    const proposal = await h.services.proposals.get(USER_ID, "task_1");
    calendar.addBusyInterval(USER_ID, proposal!.slots[0]!);

    // Rich calendar: open the first slot's day and try to book it.
    await pressRich(h, CHAT_ID, /^\d+/);
    await pressRich(h, CHAT_ID, /–/);

    // No later availability: the re-proposal lands as the HTML no-slots card.
    expect(expectRenderedText(h.kit.fake.lastCall("editMessageText")!)).toContain("свободного времени не нашлось");
    expect(h.kit.fake.messages.last(CHAT_ID)!.message.reply_markup?.inline_keyboard.flat().length).toBeGreaterThan(0);
    expect((await h.services.tasks.listByUser(USER_ID))[0]).toMatchObject({ status: "proposed", bookingId: null });
    expect(schedulerCalls).toBe(2);
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

    // One slot: one day button, one booking button in the day view.
    const oldDayData = richButtons(lastRichCall(h, CHAT_ID)).find((b) => /^\d+/.test(b.label))!.data;
    await pressRich(h, CHAT_ID, /^\d+/);
    const dayCard = h.kit.fake.messages.last(CHAT_ID)!.message;

    const failure = await h.deliverExpectingFailure(h.kit.updates.callbackQuery(dayCard, richButtons(lastRichCall(h, CHAT_ID)).find((b) => /–/.test(b.label))!.data));

    expect(failure.causeCode).toBe("unexpected");
    expect(h.logger.records).toContainEqual(expect.objectContaining({ event: "update.failed" }));
    const edited = expectCall(h.kit, "editMessageText", { chat_id: CHAT_ID, message_id: dayCard.message_id });
    expect(richText(edited)).toContain("Подготовить презентацию");
    const refreshed = h.kit.fake.messages.get(CHAT_ID, dayCard.message_id)!.message;
    expect(refreshed.rich_message).toBeDefined();
    const freshDayData = richButtons(lastRichCall(h, CHAT_ID)).find((b) => /^\d+/.test(b.label))!.data;
    expect(freshDayData).not.toBe(oldDayData);
    expect(schedulerCalls).toBe(1);

    // The retry books the restored proposal.
    await pressRich(h, CHAT_ID, /^\d+/);
    await pressRich(h, CHAT_ID, /–/);
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
