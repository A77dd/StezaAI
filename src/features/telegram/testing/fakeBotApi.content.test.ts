import { GrammyError, InputFile } from "grammy";
import type { Update } from "grammy/types";
import { describe, expect, it } from "vitest";
import { createFakeApiHarness } from "./fakeApiHarness";
import type { FakeApiHarness } from "./fakeApiHarness";

const CHAT = 1001;
const GROUP = -5_000_001;

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

describe("callback queries", () => {
  function deliverCallback(harness: FakeApiHarness, id: string): void {
    harness.fake.observeUpdate({
      update_id: 1,
      callback_query: { id, chat_instance: "ci", from: { id: CHAT, is_bot: false, first_name: "A" }, data: "x" },
    });
  }

  it("answers a delivered callback query once", async () => {
    const harness = createFakeApiHarness();
    deliverCallback(harness, "cbq-1");
    expect(harness.fake.pendingCallbackIds).toEqual(["cbq-1"]);

    expect(await harness.api.answerCallbackQuery("cbq-1", { text: "Done" })).toBe(true);

    expect(harness.fake.answeredCallbackIds).toEqual(["cbq-1"]);
    expect(harness.fake.pendingCallbackIds).toEqual([]);
  });

  it("keeps a query answered when the same update is delivered again", async () => {
    const harness = createFakeApiHarness();
    deliverCallback(harness, "cbq-1");
    await harness.api.answerCallbackQuery("cbq-1");

    deliverCallback(harness, "cbq-1");

    expect(harness.fake.pendingCallbackIds).toEqual([]);
    expect((await failure(harness.api.answerCallbackQuery("cbq-1"))).error_code).toBe(400);
  });

  it("rejects answering twice and answering an unknown query", async () => {
    const harness = createFakeApiHarness();
    deliverCallback(harness, "cbq-1");
    await harness.api.answerCallbackQuery("cbq-1");

    const expected = "Bad Request: query is too old and response timeout expired or query ID is invalid";
    expect(await failure(harness.api.answerCallbackQuery("cbq-1"))).toMatchObject({ error_code: 400, description: expected });
    expect((await failure(harness.api.answerCallbackQuery("nope"))).description).toBe(expected);
  });

  it("limits the answer text to 200 characters", async () => {
    const harness = createFakeApiHarness();
    deliverCallback(harness, "cbq-1");

    expect((await failure(harness.api.answerCallbackQuery("cbq-1", { text: "a".repeat(201) }))).error_code).toBe(400);
    expect(harness.fake.pendingCallbackIds).toEqual(["cbq-1"]);
  });
});

describe("replies and reactions", () => {
  it("embeds the replied message and rejects a reply to an unknown one", async () => {
    const harness = createFakeApiHarness();
    const original = incoming(harness, GROUP, "schedule the demo");

    const reply = await harness.api.sendMessage(GROUP, "ok", { reply_parameters: { message_id: original.message_id } });

    expect(reply.reply_to_message).toMatchObject({ message_id: original.message_id, text: "schedule the demo" });
    expect(
      (await failure(harness.api.sendMessage(GROUP, "ok", { reply_parameters: { message_id: 99 } }))).description,
    ).toBe("Bad Request: message to be replied not found");
  });

  it("keeps a topic reply in its thread", async () => {
    const { api } = createFakeApiHarness();

    const message = await api.sendMessage(-1_001_234_567_890, "x", { message_thread_id: 7 });

    expect(message).toMatchObject({ message_thread_id: 7, is_topic_message: true });
  });

  it("sets an allowed reaction on a known message and rejects others", async () => {
    const harness = createFakeApiHarness();
    const message = incoming(harness, CHAT, "forwarded");

    await harness.api.setMessageReaction(CHAT, message.message_id, [{ type: "emoji", emoji: "👀" }]);

    expect(harness.fake.reactionOn(CHAT, message.message_id)).toBe("👀");
    expect((await failure(harness.api.setMessageReaction(CHAT, message.message_id, [{ type: "emoji", emoji: "✅" as "👍" }]))).description)
      .toBe("Bad Request: REACTION_INVALID");
    expect((await failure(harness.api.setMessageReaction(CHAT, 99, [{ type: "emoji", emoji: "👍" }]))).error_code).toBe(400);

    await harness.api.setMessageReaction(CHAT, message.message_id, []);
    expect(harness.fake.reactionOn(CHAT, message.message_id)).toBeNull();
  });
});

describe("documents and files", () => {
  it("keeps the uploaded bytes and the file name of an export", async () => {
    const { api, fake } = createFakeApiHarness();
    const bytes = new TextEncoder().encode('{"tasks":[]}');

    const message = await api.sendDocument(CHAT, new InputFile(bytes, "export.json"), { caption: "Your data" });

    expect(message.document).toMatchObject({ file_name: "export.json", mime_type: "application/json", file_size: bytes.length });
    expect(message.caption).toBe("Your data");
    const entry = fake.files.get(message.document?.file_id ?? "");
    expect(new TextDecoder().decode(entry?.bytes)).toBe('{"tasks":[]}');
  });

  it("hands back the last document sent, with its content as text", async () => {
    const { api, fake } = createFakeApiHarness();
    expect(fake.sentDocument()).toBeUndefined();

    await api.sendDocument(CHAT, new InputFile(new TextEncoder().encode("a,b\n1,2"), "tasks.csv"));

    expect(fake.sentDocument(CHAT)).toMatchObject({ fileName: "tasks.csv", mimeType: "text/csv", text: "a,b\n1,2" });
    expect(fake.sentDocument(2002)).toBeUndefined();
  });

  it("reads an upload from an iterable of chunks", async () => {
    const { api, fake } = createFakeApiHarness();
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3])];

    const message = await api.sendDocument(CHAT, new InputFile(chunks, "a.bin"));

    expect([...(fake.files.get(message.document?.file_id ?? "")?.bytes ?? [])]).toEqual([1, 2, 3]);
  });

  it("resends a known file_id and rejects unknown file ids and non pdf/zip urls", async () => {
    const { api } = createFakeApiHarness();
    const first = await api.sendDocument(CHAT, new InputFile(new Uint8Array([1]), "a.pdf"));

    const again = await api.sendDocument(CHAT, first.document?.file_id ?? "");
    expect(again.document?.file_name).toBe("a.pdf");
    expect((await failure(api.sendDocument(CHAT, "nope"))).description).toBe("Bad Request: wrong file identifier/HTTP URL specified");
    expect((await failure(api.sendDocument(CHAT, "https://example.com/a.txt"))).description).toBe(
      "Bad Request: wrong type of the web page content",
    );
  });

  it("getFile answers for known files, rejects unknown ids and files over 20 MB", async () => {
    const { api, fake } = createFakeApiHarness();
    fake.files.register({ file_id: "voice-1", file_unique_id: "u1", file_size: 1000, file_path: "voice/voice-1.oga" });
    fake.files.register({ file_id: "big", file_unique_id: "u2", file_size: 21 * 1024 * 1024, file_path: "voice/big.oga" });

    expect(await api.getFile("voice-1")).toEqual({
      file_id: "voice-1",
      file_unique_id: "u1",
      file_size: 1000,
      file_path: "voice/voice-1.oga",
    });
    expect((await failure(api.getFile("nope"))).description).toBe("Bad Request: invalid file_id");
    expect((await failure(api.getFile("big"))).description).toBe("Bad Request: file is too big");
  });
});
