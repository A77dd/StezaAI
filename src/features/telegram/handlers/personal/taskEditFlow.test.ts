import { describe, expect, it } from "vitest";
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

async function proposeTask(h: ReturnType<typeof makeHarness>) {
  await h.services.personalFlow.startUser({ userId: USER_ID, locale: "ru" });
  await h.services.personalFlow.setTimezone({ userId: USER_ID, tz: "Europe/Moscow" });
  await h.deliver(h.kit.updates.privateText(TASK_TEXT, { from: ALEX }));
  return h.kit.fake.messages.last(CHAT_ID)!.message;
}

describe("personal flow: task.edit", () => {
  it("prompts for the change, then applies the reply and refreshes the ORIGINAL card", async () => {
    const h = makeHarness();
    const card = await proposeTask(h);

    const press = await h.kit.press(h.bot, card, { text: "Изменить" });
    expectCallbackAnsweredOnce(h.kit, press.callback_query.id);
    const prompt = h.kit.fake.messages.last(CHAT_ID)!.message;
    expect(expectRenderedText(h.kit.fake.lastCall("sendMessage")!)).toBe("Что изменить?");
    expect(prompt.message_id).not.toBe(card.message_id);

    await h.deliver(h.kit.updates.privateText("Подготовить презентацию на час", { from: ALEX }));

    const edited = expectCall(h.kit, "editMessageText", { chat_id: CHAT_ID, message_id: card.message_id });
    expect(expectRenderedText(edited)).toContain("Подготовить презентацию");
    // No new proposal card was sent for the reply: it edited the original.
    expect(h.kit.fake.callsTo("sendMessage")).toHaveLength(2); // the task card + the "what to change" prompt

    const task = (await h.services.tasks.listByUser(USER_ID))[0];
    expect(task?.durationMinutes).toBe(60);
  });

  it("cancels the booking and reschedules when editing an already-booked task", async () => {
    const h = makeHarness();
    // `task.edit` is not single-use (30 days TTL), so a token issued on the
    // still-`proposed` card stays resolvable even after the card is edited to
    // `booked` and the button disappears from the client — a stale client or
    // a second device could still send it. `applyTaskEdit` must handle that
    // ("only these statuses can be edited" includes `scheduled`) rather than
    // assume the button it came from is still visible.
    const proposedCard = await proposeTask(h);
    const firstButton = proposedCard.reply_markup!.inline_keyboard[0][0] as { callback_data: string };
    await h.kit.press(h.bot, proposedCard, { data: firstButton.callback_data });
    expect((await h.services.tasks.listByUser(USER_ID))[0]?.status).toBe("scheduled");

    await h.kit.press(h.bot, proposedCard, { text: "Изменить" });
    const reminders = await h.services.reminders.exportForUser(USER_ID);
    const pendingBefore = reminders.filter((reminder) => reminder.status === "pending").length;
    expect(pendingBefore).toBeGreaterThan(0);

    await h.deliver(h.kit.updates.privateText("Подготовить презентацию на час, до пятницы", { from: ALEX }));

    const task = (await h.services.tasks.listByUser(USER_ID))[0];
    expect(task?.status).toBe("proposed");
    expect(task?.bookingId).toBeNull();
    const remindersAfter = await h.services.reminders.exportForUser(USER_ID);
    expect(remindersAfter.filter((reminder) => reminder.status === "pending")).toHaveLength(0);
  });

  it("preserves an actionable proposal with fresh slot tokens when the reply changed nothing", async () => {
    const h = makeHarness();
    const card = await proposeTask(h);
    const oldData = (card.reply_markup!.inline_keyboard[0]![0] as { callback_data: string }).callback_data;
    await h.kit.press(h.bot, card, { text: "Изменить" });

    await h.deliver(h.kit.updates.privateText("хм ладно", { from: ALEX }));

    const edited = expectCall(h.kit, "editMessageText", { chat_id: CHAT_ID, message_id: card.message_id });
    expect(expectRenderedText(edited)).toContain("Подготовить презентацию");
    const refreshed = h.kit.fake.messages.get(CHAT_ID, card.message_id)!.message;
    const freshData = (refreshed.reply_markup!.inline_keyboard[0]![0] as { callback_data: string }).callback_data;
    expect(freshData).not.toBe(oldData);

    await h.kit.press(h.bot, refreshed, { data: freshData });
    expect((await h.services.tasks.listByUser(USER_ID))[0]?.status).toBe("scheduled");
  });
});
