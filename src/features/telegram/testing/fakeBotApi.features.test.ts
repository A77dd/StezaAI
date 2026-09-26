import { GrammyError } from "grammy";
import { describe, expect, it } from "vitest";
import { createFakeApiHarness } from "./fakeApiHarness";
import type { FakeApiHarness } from "./fakeApiHarness";

const CHAT = 1001;
const GROUP = -1_001_234_567_890;
const USER = { id: CHAT, is_bot: false, first_name: "Alex" } as const;

async function failure(promise: Promise<unknown>): Promise<GrammyError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GrammyError) return error;
    throw error;
  }
  throw new Error("expected a GrammyError");
}

describe("sendMessageDraft", () => {
  it("shows a draft for up to 30 seconds and animates updates with the same draft id", async () => {
    const { api, fake, clock } = createFakeApiHarness();

    await api.sendMessageDraft(CHAT, 5, "Looking for time", { can_stop: true });
    clock.advanceSeconds(10);
    await api.sendMessageDraft(CHAT, 5, "Looking for time...", { can_stop: true });

    expect(fake.activeDrafts(CHAT)).toMatchObject([{ draftId: 5, text: "Looking for time...", canStop: true }]);
    clock.advanceSeconds(29);
    expect(fake.activeDrafts(CHAT)).toHaveLength(1);
    clock.advanceSeconds(1);
    expect(fake.activeDrafts(CHAT)).toHaveLength(0);
  });

  it("keeps drafts with different ids apart", async () => {
    const { api, fake } = createFakeApiHarness();

    await api.sendMessageDraft(CHAT, 1, "a");
    await api.sendMessageDraft(CHAT, 2, "b");

    expect(fake.activeDrafts(CHAT).map((draft) => draft.draftId)).toEqual([1, 2]);
  });

  it("ends the drafts of a chat when the bot sends a message there", async () => {
    const { api, fake } = createFakeApiHarness();
    await api.sendMessageDraft(CHAT, 1, "thinking");
    await api.sendMessageDraft(2002, 1, "other chat");

    await api.sendMessage(CHAT, "final");

    expect(fake.activeDrafts(CHAT)).toHaveLength(0);
    expect(fake.activeDrafts(2002)).toHaveLength(1);
  });

  it("rejects group chats, a zero draft id and text over 4096 characters", async () => {
    const { api } = createFakeApiHarness();

    expect((await failure(api.sendMessageDraft(GROUP, 1, "x"))).error_code).toBe(400);
    expect((await failure(api.sendMessageDraft(CHAT, 0, "x"))).description).toMatch(/draft_id/);
    expect((await failure(api.sendMessageDraft(CHAT, 1, "a".repeat(4097)))).description).toBe("Bad Request: message is too long");
  });

  it("accepts an empty text for the thinking placeholder", async () => {
    const { api, fake } = createFakeApiHarness();

    await api.sendMessageDraft(CHAT, 1, "");

    expect(fake.activeDrafts(CHAT)[0]?.text).toBe("");
  });

  it("ends a draft when the user stops generation unless keep_on_stop is set", async () => {
    const { api, fake } = createFakeApiHarness();
    const chat = { id: CHAT, type: "private", first_name: "Alex" } as const;
    await api.sendMessageDraft(CHAT, 1, "a", { can_stop: true });
    await api.sendMessageDraft(CHAT, 2, "b", { can_stop: true, keep_on_stop: true });

    fake.observeUpdate({ update_id: 1, stopped_message_generation: { chat, draft_id: 1 } });
    fake.observeUpdate({ update_id: 2, stopped_message_generation: { chat, draft_id: 2 } });

    expect(fake.activeDrafts(CHAT).map((draft) => draft.draftId)).toEqual([2]);
  });
});

describe("sendChatAction", () => {
  it("accepts the documented actions and rejects others", async () => {
    const { api } = createFakeApiHarness();

    expect(await api.sendChatAction(CHAT, "record_voice")).toBe(true);
    expect((await failure(api.sendChatAction(CHAT, "dancing" as "typing"))).error_code).toBe(400);
  });
});

describe("ephemeral messages", () => {
  function pressButton(harness: FakeApiHarness, id: string): void {
    harness.fake.observeUpdate({
      update_id: 1,
      callback_query: { id, chat_instance: "ci", from: USER, data: "x" },
    });
  }

  const ephemeral = (id: string) => ({ ephemeral_message_parameters: { receiver_user_id: CHAT, callback_query_id: id } });

  it("sends a message only the receiver sees within 15 seconds of the button press", async () => {
    const harness = createFakeApiHarness();
    pressButton(harness, "cbq-1");
    harness.clock.advanceSeconds(15);

    const message = await harness.api.sendMessage(GROUP, "only for you", ephemeral("cbq-1"));

    expect(message).toMatchObject({ message_id: 0, ephemeral_message_id: 1, receiver_user: { id: CHAT } });
    expect(harness.fake.ephemeralMessages()).toHaveLength(1);
    expect(harness.fake.messages.list(GROUP)).toHaveLength(0);
  });

  it("rejects an ephemeral message after the 15 second window or for an unknown query", async () => {
    const harness = createFakeApiHarness();
    pressButton(harness, "cbq-1");
    harness.clock.advanceMs(15_001);

    expect((await failure(harness.api.sendMessage(GROUP, "late", ephemeral("cbq-1")))).description).toMatch(/15 seconds/);
    expect((await failure(harness.api.sendMessage(GROUP, "x", ephemeral("nope")))).description).toMatch(/query is too old/);
  });

  it("edits and deletes an ephemeral message the bot sent", async () => {
    const harness = createFakeApiHarness();
    pressButton(harness, "cbq-1");
    const sent = await harness.api.sendMessage(GROUP, "choose", ephemeral("cbq-1"));

    await harness.api.raw.editEphemeralMessageText({
      chat_id: GROUP,
      receiver_user_id: CHAT,
      ephemeral_message_id: sent.ephemeral_message_id ?? 0,
      text: "chosen",
    });
    expect(harness.fake.ephemeralMessages()[0]?.message.text).toBe("chosen");

    await harness.api.raw.deleteEphemeralMessage({
      chat_id: GROUP,
      receiver_user_id: CHAT,
      ephemeral_message_id: sent.ephemeral_message_id ?? 0,
    });
    expect(harness.fake.ephemeralMessages()).toHaveLength(0);
  });

  it("is not available in private chats", async () => {
    const harness = createFakeApiHarness();
    pressButton(harness, "cbq-1");

    expect((await failure(harness.api.sendMessage(CHAT, "x", ephemeral("cbq-1")))).description).toMatch(/group chats/);
  });
});

describe("inline and guest queries", () => {
  it("answers an inline query once", async () => {
    const { api, fake } = createFakeApiHarness();
    fake.observeUpdate({ update_id: 1, inline_query: { id: "iq-1", from: USER, query: "free time", offset: "" } });
    const results = [
      {
        type: "article" as const,
        id: "r1",
        title: "Free time",
        input_message_content: { message_text: "Friday 15:00" },
      },
    ];

    expect(await api.answerInlineQuery("iq-1", results, { is_personal: true, cache_time: 0 })).toBe(true);

    expect(fake.answeredInlineQueryIds()).toEqual(["iq-1"]);
    expect((await failure(api.answerInlineQuery("iq-1", results))).description).toMatch(/query is too old/);
    expect((await failure(api.answerInlineQuery("unknown", results))).description).toMatch(/query is too old/);
  });

  it("rejects invalid inline results", async () => {
    const { api, fake } = createFakeApiHarness();
    fake.observeUpdate({ update_id: 1, inline_query: { id: "iq-1", from: USER, query: "", offset: "" } });

    const error = await failure(
      api.answerInlineQuery("iq-1", [
        { type: "article", id: "r", title: "T", input_message_content: { message_text: "a".repeat(4097) } },
      ]),
    );

    expect(error.description).toBe("Bad Request: message is too long");
  });

  it("answers a guest query once and lets the bot edit the guest reply", async () => {
    const { api, fake } = createFakeApiHarness();
    fake.observeUpdate({
      update_id: 1,
      guest_message: {
        message_id: 1,
        date: 1,
        chat: { id: GROUP, type: "supergroup", title: "S" },
        from: USER,
        guest_query_id: "gq-1",
        text: "@steza_test_bot plan",
      },
    });

    const sent = await api.raw.answerGuestQuery({
      guest_query_id: "gq-1",
      result: { type: "article", id: "g", title: "Pointer", input_message_content: { message_text: "Open the bot" } },
    });

    expect(sent.inline_message_id).toBeTruthy();
    expect(fake.answeredGuestQueryIds()).toEqual(["gq-1"]);
    expect(await api.editMessageTextInline(sent.inline_message_id, "Updated")).toBe(true);
    expect(
      (
        await failure(
          api.raw.answerGuestQuery({
            guest_query_id: "gq-1",
            result: { type: "article", id: "g", title: "Again", input_message_content: { message_text: "x" } },
          }),
        )
      ).description,
    ).toMatch(/query is too old/);
  });
});
