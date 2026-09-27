import { afterEach, describe, expect, it, vi } from "vitest";
import { createPipelineHarness } from "../../testing/pipelineHarness";
import { ALEX, createGroupChat } from "../../testing/participants";
import { registerPersonalFlow } from "./index";

afterEach(() => vi.useRealTimers());

async function harness() {
  const h = createPipelineHarness({ composers: [registerPersonalFlow()], failRichMessages: true });
  await h.services.personalFlow.startUser({ userId: String(ALEX.id), locale: "ru" });
  await h.services.personalFlow.setTimezone({ userId: String(ALEX.id), tz: "Europe/Moscow" });
  return h;
}

describe("forwarded messages", () => {
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
