import { describe, expect, it } from "vitest";
import { ALEX } from "../../testing/participants";
import { createPipelineHarness } from "../../testing/pipelineHarness";
import { expectCall, expectRenderedText } from "../../testing/assertions";
import { registerPersonalFlow } from "./index";

const TASK_TEXT = "Нужно до пятницы подготовить презентацию, часа на два";
const USER_ID = String(ALEX.id);
const CHAT_ID = ALEX.id;

function makeHarness() {
  return createPipelineHarness({ composers: [registerPersonalFlow()] });
}

describe("personal flow: timezone gating", () => {
  it("asks for a timezone on a fresh user's first message, then auto-continues with the original text once it is set", async () => {
    const h = makeHarness();

    await h.deliver(h.kit.updates.privateText(TASK_TEXT, { from: ALEX }));

    const ask = expectCall(h.kit, "sendMessage", { chat_id: CHAT_ID });
    expect(expectRenderedText(ask)).toContain("часовой пояс");
    expect(await h.services.settings.get(USER_ID)).not.toBeNull();
    expect((await h.services.settings.get(USER_ID))?.timezoneConfirmed).toBe(false);

    await h.deliver(h.kit.updates.privateText("Europe/Moscow", { from: ALEX }));

    const settings = await h.services.settings.get(USER_ID);
    expect(settings?.timezoneConfirmed).toBe(true);
    expect(settings?.timezone).toBe("Europe/Moscow");

    // The original task text was replayed: a proposal card followed, not
    // another timezone prompt and not a task titled "Europe/Moscow".
    const proposalCall = h.kit.fake.calls.at(-1);
    expect(proposalCall?.method).toBe("sendMessage");
    expect(expectRenderedText(proposalCall!)).toContain("Подготовить презентацию");

    const tasks = await h.services.tasks.listByUser(USER_ID);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe("Подготовить презентацию");
  });

  it("sets the timezone by pressing a preset button", async () => {
    const h = makeHarness();
    await h.deliver(h.kit.updates.privateText(TASK_TEXT, { from: ALEX }));
    const prompt = h.kit.fake.messages.last(CHAT_ID)!.message;

    const press = await h.kit.press(h.bot, prompt, { text: "Europe/Moscow" });

    const settings = await h.services.settings.get(USER_ID);
    expect(settings?.timezoneConfirmed).toBe(true);
    expect(settings?.timezone).toBe("Europe/Moscow");
    expect(h.kit.fake.answeredCallbackIds).toContain(press.callback_query.id);

    // The queued task text was replayed here too.
    const tasks = await h.services.tasks.listByUser(USER_ID);
    expect(tasks).toHaveLength(1);
  });

  it("rejects an unknown timezone explicitly instead of silently accepting it", async () => {
    const h = makeHarness();
    await h.deliver(h.kit.updates.privateText(TASK_TEXT, { from: ALEX }));

    const error = await h.deliverExpectingFailure(h.kit.updates.privateText("Mars/Olympus", { from: ALEX }));

    expect(error.causeCode).toBe("invalid_timezone");
    expectCall(h.kit, "sendMessage", { text: "Не знаю такого часового пояса. Пример: Europe/Moscow." });
    expect((await h.services.settings.get(USER_ID))?.timezoneConfirmed).toBe(false);
  });
});
