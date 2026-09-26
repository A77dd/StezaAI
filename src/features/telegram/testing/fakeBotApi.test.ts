import { Api, GrammyError } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { createFakeApiHarness } from "./fakeApiHarness";
import { createFakeBotApi } from "./fakeBotApi";
import { fakeBotInfo } from "./participants";

const CHAT = 1001;

async function failure(promise: Promise<unknown>): Promise<GrammyError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GrammyError) return error;
    throw error;
  }
  throw new Error("expected a GrammyError");
}

describe("createFakeBotApi: transformer", () => {
  it("answers without calling the next transformer or the network", async () => {
    const fake = createFakeBotApi();
    const prev = vi.fn();

    const response = await fake.transformer(prev, "sendMessage", { chat_id: CHAT, text: "hi" });

    expect(prev).not.toHaveBeenCalled();
    expect(response.ok).toBe(true);
  });

  it("returns a realistic message with incrementing ids per chat", async () => {
    const { api, clock } = createFakeApiHarness();

    const first = await api.sendMessage(CHAT, "one");
    const second = await api.sendMessage(CHAT, "two");
    const other = await api.sendMessage(2002, "three");

    expect([first.message_id, second.message_id, other.message_id]).toEqual([1, 2, 1]);
    expect(first).toMatchObject({
      chat: { id: CHAT, type: "private" },
      text: "one",
      date: Math.floor(Date.parse(clock.now()) / 1000),
      from: { is_bot: true, username: "steza_test_bot" },
    });
  });

  it("returns entities parsed from HTML and a group chat for a negative id", async () => {
    const { api } = createFakeApiHarness();

    const message = await api.sendMessage(-5_000_001, "<b>hi</b>", { parse_mode: "HTML" });

    expect(message.text).toBe("hi");
    expect(message.entities).toEqual([{ type: "bold", offset: 0, length: 2 }]);
    expect(message.chat.type).toBe("group");
  });

  it("stamps messages with the injected clock, not real time", async () => {
    const { api, clock } = createFakeApiHarness();

    const before = await api.sendMessage(CHAT, "a");
    clock.advanceSeconds(90);
    const after = await api.sendMessage(CHAT, "b");

    expect(after.date - before.date).toBe(90);
  });

  it("uses a swapped clock after setClock", async () => {
    const { api, fake } = createFakeApiHarness();
    fake.setClock({ now: () => "2030-01-01T00:00:00.000Z" });

    const message = await api.sendMessage(CHAT, "a");

    expect(message.date).toBe(Date.parse("2030-01-01T00:00:00.000Z") / 1000);
  });

  it("throws for a method it does not implement instead of pretending", async () => {
    const { api } = createFakeApiHarness();

    await expect(api.getForumTopicIconStickers()).rejects.toThrow(/getForumTopicIconStickers is not implemented/);
  });

  it("answers getMe with the configured bot", async () => {
    const api = new Api("1:x");
    const fake = createFakeBotApi({ botInfo: fakeBotInfo("other_bot", 42) });
    api.config.use(fake.transformer);

    expect(await api.getMe()).toMatchObject({ id: 42, username: "other_bot", is_bot: true });
  });
});

describe("createFakeBotApi: recording", () => {
  it("records every call with payload, time and outcome", async () => {
    const { api, fake, clock } = createFakeApiHarness();

    await api.sendMessage(CHAT, "hi", { link_preview_options: { is_disabled: true } });

    const call = fake.lastCall("sendMessage");
    expect(call).toMatchObject({
      seq: 1,
      method: "sendMessage",
      payload: { chat_id: CHAT, text: "hi", link_preview_options: { is_disabled: true } },
      at: clock.now(),
      outcome: { kind: "ok" },
    });
  });

  it("filters calls by method and finds the last call", async () => {
    const { api, fake } = createFakeApiHarness();

    await api.sendMessage(CHAT, "one");
    await api.sendChatAction(CHAT, "typing");
    await api.sendMessage(CHAT, "two");

    expect(fake.calls.map((call) => call.method)).toEqual(["sendMessage", "sendChatAction", "sendMessage"]);
    expect(fake.callsTo("sendMessage")).toHaveLength(2);
    expect(fake.lastCall()?.method).toBe("sendMessage");
    expect(fake.lastCall("sendChatAction")?.payload).toEqual({ chat_id: CHAT, action: "typing" });
    expect(fake.lastCall("sendPhoto")).toBeUndefined();
  });

  it("records the wire form of the payload: undefined fields are dropped", async () => {
    const { api, fake } = createFakeApiHarness();

    await api.sendMessage(CHAT, "hi", { parse_mode: undefined });

    expect(fake.lastCall()?.payload).toEqual({ chat_id: CHAT, text: "hi" });
    expect("parse_mode" in (fake.lastCall()?.payload ?? {})).toBe(false);
  });

  it("records rejected calls with the error", async () => {
    const { api, fake } = createFakeApiHarness();

    await failure(api.sendMessage(CHAT, "a".repeat(4097)));

    expect(fake.lastCall()?.outcome).toEqual({
      kind: "error",
      error_code: 400,
      description: "Bad Request: message is too long",
    });
  });

  it("reset forgets calls and state but message ids keep counting", async () => {
    const { api, fake } = createFakeApiHarness();
    await api.sendMessage(CHAT, "a");

    fake.reset();

    expect(fake.calls).toHaveLength(0);
    expect(fake.messages.list()).toHaveLength(0);
    expect((await api.sendMessage(CHAT, "b")).message_id).toBe(2);
  });
});

describe("createFakeBotApi: rejects what the real API rejects", () => {
  it("throws a real GrammyError with the API's error code and description", async () => {
    const { api } = createFakeApiHarness();

    const error = await failure(api.sendMessage(CHAT, "x".repeat(4097)));

    expect(error).toBeInstanceOf(GrammyError);
    expect(error).toMatchObject({
      method: "sendMessage",
      error_code: 400,
      description: "Bad Request: message is too long",
    });
  });

  it("rejects callback_data over 64 bytes", async () => {
    const { api } = createFakeApiHarness();

    const error = await failure(
      api.sendMessage(CHAT, "x", {
        reply_markup: { inline_keyboard: [[{ text: "Go", callback_data: "я".repeat(33) }]] },
      }),
    );

    expect(error.description).toBe("Bad Request: BUTTON_DATA_INVALID");
  });

  it("rejects invalid HTML with can't parse entities", async () => {
    const { api } = createFakeApiHarness();

    const error = await failure(api.sendMessage(CHAT, "<b>open", { parse_mode: "HTML" }));

    expect(error.description).toMatch(/^Bad Request: can't parse entities: /);
  });

  it("rejects more than 100 inline buttons", async () => {
    const { api } = createFakeApiHarness();
    const rows = Array.from({ length: 26 }, (_, r) =>
      Array.from({ length: 4 }, (_, c) => ({ text: "b", callback_data: `${r}:${c}` })),
    );

    const error = await failure(api.sendMessage(CHAT, "x", { reply_markup: { inline_keyboard: rows } }));

    expect(error.description).toBe("Bad Request: REPLY_MARKUP_TOO_LONG");
  });

  it("rejects a missing chat", async () => {
    const fake = createFakeBotApi();
    // @ts-expect-error a payload without chat_id is invalid on purpose
    const response = await fake.transformer(vi.fn(), "sendMessage", { text: "hi" });

    expect(response).toEqual({ ok: false, error_code: 400, description: "Bad Request: chat_id is empty" });
  });

  it("does not change state when a call is rejected", async () => {
    const { api, fake } = createFakeApiHarness();

    await failure(api.sendMessage(CHAT, ""));

    expect(fake.messages.list()).toHaveLength(0);
  });
});
