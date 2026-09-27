import { describe, expect, it } from "vitest";
import { ALEX } from "../../testing/participants";
import { createPipelineHarness } from "../../testing/pipelineHarness";
import { expectCall, expectCallbackAnsweredOnce, expectRenderedText } from "../../testing/assertions";
import { registerPersonalFlow } from "./index";

const TASK_TEXT = "Нужно до пятницы подготовить презентацию, часа на два";
const USER_ID = String(ALEX.id);
const CHAT_ID = ALEX.id;

function makeHarness() {
  return createPipelineHarness({ composers: [registerPersonalFlow()], failRichMessages: true });
}

async function proposeTask(h: ReturnType<typeof makeHarness>) {
  await h.services.personalFlow.startUser({ userId: USER_ID, locale: "ru" });
  await h.services.personalFlow.setTimezone({ userId: USER_ID, tz: "Europe/Moscow" });
  await h.deliver(h.kit.updates.privateText(TASK_TEXT, { from: ALEX }));
  return h.kit.fake.messages.last(CHAT_ID)!.message;
}

describe("personal flow: slot.other", () => {
  it("proposes a fresh set of slots on the same card", async () => {
    const h = makeHarness();
    const card = await proposeTask(h);

    const press = await h.kit.press(h.bot, card, { text: "Другое время" });

    const edited = expectCall(h.kit, "editMessageText", { chat_id: CHAT_ID, message_id: card.message_id });
    expect(expectRenderedText(edited)).toContain("Подготовить презентацию");
    expectCallbackAnsweredOnce(h.kit, press.callback_query.id);
  });

  it("explains itself once no more slots can be found, without crashing", async () => {
    const h = makeHarness();
    let card = await proposeTask(h);

    // Keep asking for other time until the search is exhausted (the search
    // horizon is bounded, so this terminates).
    let sawExhausted = false;
    for (let attempt = 0; attempt < 10 && !sawExhausted; attempt += 1) {
      await h.kit.press(h.bot, card, { text: "Другое время" });
      const edited = h.kit.fake.lastCall("editMessageText")!;
      const text = expectRenderedText(edited);
      card = { ...card, reply_markup: edited.payload.reply_markup as typeof card.reply_markup };
      if (text.includes("свободного времени") || text.includes("Свободных окон")) sawExhausted = true;
    }

    expect(sawExhausted).toBe(true);
  });
});
