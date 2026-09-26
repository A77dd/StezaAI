import { GrammyError, InputFile } from "grammy";
import type { Update } from "grammy/types";
import { describe, expect, it } from "vitest";
import { createFakeApiHarness } from "./fakeApiHarness";
import type { FakeApiHarness } from "./fakeApiHarness";

const CHAT = 1001;
const GROUP = -5_000_001;
const keyboard = (data: string) => ({ inline_keyboard: [[{ text: "Go", callback_data: data }]] });

async function failure(promise: Promise<unknown>): Promise<GrammyError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GrammyError) return error;
    throw error;
  }
  throw new Error("expected a GrammyError");
}

function incoming(harness: FakeApiHarness, chatId: number, text: string): NonNullable<Update["message"]> {
  const message: NonNullable<Update["message"]> = {
    message_id: harness.messageIds.next(chatId),
    date: Math.floor(harness.clock.nowMs() / 1000),
    chat: chatId > 0 ? { id: chatId, type: "private", first_name: "Alex" } : { id: chatId, type: "group", title: "G" },
    from: { id: 1001, is_bot: false, first_name: "Alex" },
    text,
  };
  harness.fake.registerIncomingMessage(message);
  return message;
}

describe("edits", () => {
  it("edits a message the bot sent and returns the edited message", async () => {
    const { api, fake, clock } = createFakeApiHarness();
    const sent = await api.sendMessage(CHAT, "old", { reply_markup: keyboard("a") });
    clock.advanceSeconds(5);

    const edited = await api.editMessageText(CHAT, sent.message_id, "new", { reply_markup: keyboard("a") });

    expect(edited).toMatchObject({ message_id: sent.message_id, text: "new", edit_date: expect.any(Number) });
    expect(fake.messages.get(CHAT, sent.message_id)?.message.text).toBe("new");
  });

  it("rejects editing a message that does not exist", async () => {
    const { api } = createFakeApiHarness();

    const error = await failure(api.editMessageText(CHAT, 99, "x"));

    expect(error).toMatchObject({ error_code: 400, description: "Bad Request: message to edit not found" });
  });

  it("rejects an edit that changes nothing, keyboard included", async () => {
    const { api } = createFakeApiHarness();
    const sent = await api.sendMessage(CHAT, "same", { reply_markup: keyboard("a") });

    const error = await failure(api.editMessageText(CHAT, sent.message_id, "same", { reply_markup: keyboard("a") }));

    expect(error.error_code).toBe(400);
    expect(error.description).toMatch(/^Bad Request: message is not modified/);
  });

  it("treats a missing keyboard as removing it, so the edit is a change", async () => {
    const { api, fake } = createFakeApiHarness();
    const sent = await api.sendMessage(CHAT, "same", { reply_markup: keyboard("a") });

    const edited = await api.editMessageText(CHAT, sent.message_id, "same");

    expect(edited).not.toHaveProperty("reply_markup");
    expect(fake.messages.get(CHAT, sent.message_id)?.message.reply_markup).toBeUndefined();
  });

  it("compares text after parsing, so different markup with the same result is not modified", async () => {
    const { api } = createFakeApiHarness();
    const sent = await api.sendMessage(CHAT, "a &amp; b", { parse_mode: "HTML" });

    const error = await failure(api.editMessageText(CHAT, sent.message_id, "a &#38; b", { parse_mode: "HTML" }));

    expect(error.description).toMatch(/not modified/);
  });

  it("rejects editing a message of the user", async () => {
    const harness = createFakeApiHarness();
    const message = incoming(harness, CHAT, "hi");

    const error = await failure(harness.api.editMessageText(CHAT, message.message_id, "x"));

    expect(error.description).toBe("Bad Request: message can't be edited");
  });

  it("rejects editing the text of a document and a deleted message", async () => {
    const { api } = createFakeApiHarness();
    const document = await api.sendDocument(CHAT, new InputFile(new Uint8Array([1]), "a.json"));
    const text = await api.sendMessage(CHAT, "x");
    await api.deleteMessage(CHAT, text.message_id);

    expect((await failure(api.editMessageText(CHAT, document.message_id, "x"))).description).toBe(
      "Bad Request: there is no text in the message to edit",
    );
    expect((await failure(api.editMessageText(CHAT, text.message_id, "y"))).description).toBe(
      "Bad Request: message to edit not found",
    );
  });

  it("edits only the reply markup and detects an unchanged one", async () => {
    const { api } = createFakeApiHarness();
    const sent = await api.sendMessage(CHAT, "x", { reply_markup: keyboard("a") });

    const edited = await api.editMessageReplyMarkup(CHAT, sent.message_id, { reply_markup: keyboard("b") });
    expect(edited).toMatchObject({ reply_markup: keyboard("b") });

    expect(
      (await failure(api.editMessageReplyMarkup(CHAT, sent.message_id, { reply_markup: keyboard("b") }))).description,
    ).toMatch(/not modified/);
  });

  it("supports a disabled button after the action, as the plan's resolved cards do", async () => {
    const { api } = createFakeApiHarness();
    const sent = await api.sendMessage(CHAT, "card", { reply_markup: keyboard("a") });

    const edited = await api.editMessageReplyMarkup(CHAT, sent.message_id, {
      reply_markup: { inline_keyboard: [[{ text: "✅ Done", disabled: {} }]] },
    });

    expect(edited).toMatchObject({ reply_markup: { inline_keyboard: [[{ text: "✅ Done", disabled: {} }]] } });
  });

  it("requires a target and validates the new text like sendMessage", async () => {
    const { api } = createFakeApiHarness();
    const sent = await api.sendMessage(CHAT, "x");

    expect((await failure(api.editMessageText(CHAT, sent.message_id, "a".repeat(4097)))).description).toBe(
      "Bad Request: message is too long",
    );
    expect(
      (await failure(api.editMessageText(CHAT, sent.message_id, "<b>x", { parse_mode: "HTML" }))).description,
    ).toMatch(/can't parse entities/);
  });

  it("edits inline messages the bot may know, and rejects unknown ones", async () => {
    const { api, fake } = createFakeApiHarness();
    fake.observeUpdate({
      update_id: 1,
      chosen_inline_result: { result_id: "r", from: { id: 5, is_bot: false, first_name: "A" }, query: "q", inline_message_id: "inl-1" },
    });

    expect(await api.editMessageTextInline("inl-1", "new")).toBe(true);
    expect((await failure(api.editMessageTextInline("nope", "new"))).description).toBe("Bad Request: MESSAGE_ID_INVALID");
  });
});

describe("deletes", () => {
  it("deletes a message and remembers it as deleted", async () => {
    const { api, fake } = createFakeApiHarness();
    const sent = await api.sendMessage(CHAT, "x");

    expect(await api.deleteMessage(CHAT, sent.message_id)).toBe(true);

    expect(fake.messages.get(CHAT, sent.message_id)).toBeUndefined();
    expect(fake.messages.deleted(CHAT)).toHaveLength(1);
    expect((await failure(api.deleteMessage(CHAT, sent.message_id))).description).toBe(
      "Bad Request: message to delete not found",
    );
  });

  it("refuses to delete a message older than 48 hours", async () => {
    const { api, clock } = createFakeApiHarness();
    const sent = await api.sendMessage(CHAT, "x");
    clock.advanceSeconds(48 * 3600);

    expect((await failure(api.deleteMessage(CHAT, sent.message_id))).description).toBe(
      "Bad Request: message can't be deleted",
    );
  });

  it("deletes the user's messages in private chats but not in groups", async () => {
    const harness = createFakeApiHarness();
    const privateMessage = incoming(harness, CHAT, "hi");
    const groupMessage = incoming(harness, GROUP, "hi");

    expect(await harness.api.deleteMessage(CHAT, privateMessage.message_id)).toBe(true);
    expect((await failure(harness.api.deleteMessage(GROUP, groupMessage.message_id))).description).toBe(
      "Bad Request: message can't be deleted",
    );
  });

  it("does not resurrect a deleted message when its update is delivered again", async () => {
    const harness = createFakeApiHarness();
    const message = incoming(harness, CHAT, "hi");
    await harness.api.deleteMessage(CHAT, message.message_id);

    harness.fake.registerIncomingMessage(message);

    expect(harness.fake.messages.get(CHAT, message.message_id)).toBeUndefined();
  });

  it("skips unknown identifiers in deleteMessages", async () => {
    const { api, fake } = createFakeApiHarness();
    const a = await api.sendMessage(CHAT, "a");
    await api.sendMessage(CHAT, "b");

    expect(await api.deleteMessages(CHAT, [a.message_id, 99])).toBe(true);
    expect(fake.messages.list(CHAT)).toHaveLength(1);
  });
});
