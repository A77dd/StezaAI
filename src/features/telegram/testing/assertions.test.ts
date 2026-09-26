import { InputFile } from "grammy";
import { describe, expect, it } from "vitest";
import { expectCall, expectCallbackAnsweredOnce, expectNoCalls, expectRenderedText } from "./assertions";
import { ALEX } from "./participants";
import { createTelegramTestKit } from "./testKit";

const withCalls = createTelegramTestKit;

describe("expectCall", () => {
  it("returns the first call whose payload contains the expected fields", async () => {
    const kit = withCalls();
    await kit.api.sendMessage(1, "first");
    await kit.api.sendMessage(2, "second", { reply_markup: { inline_keyboard: [[{ text: "Go", callback_data: "d" }]] } });

    const call = expectCall(kit, "sendMessage", { chat_id: 2, reply_markup: { inline_keyboard: [[{ text: "Go" }]] } });

    expect(call.payload.text).toBe("second");
  });

  it("accepts predicates, regular expressions and asymmetric matchers", async () => {
    const kit = withCalls();
    await kit.api.sendMessage(1, "Slot on Friday");

    expectCall(kit, "sendMessage", (payload) => payload.chat_id === 1);
    expectCall(kit, "sendMessage", { text: /friday$/i });
    expectCall(kit, "sendMessage", { text: (value: unknown) => typeof value === "string" && value.startsWith("Slot") });
    expectCall(kit, "sendMessage", { text: expect.stringContaining("Friday") });
    expectCall(kit, "sendMessage");
  });

  it("fails with the calls that were made when nothing matches", async () => {
    const kit = withCalls();
    await kit.api.sendMessage(1, "hello");

    expect(() => expectCall(kit, "sendMessage", { chat_id: 2 })).toThrow(/expected a call to sendMessage matching \{"chat_id":2\}.*#1 sendMessage/s);
    expect(() => expectCall(kit, "editMessageText")).toThrow(/calls to editMessageText:\n {2}\(none\)/);
    expect(() => expectCall(kit, "sendMessage", () => false)).toThrow(/predicate/);
  });

  it("does not match arrays of a different length or a missing object", async () => {
    const kit = withCalls();
    await kit.api.sendMessage(1, "x", { reply_markup: { inline_keyboard: [[{ text: "A", callback_data: "a" }], [{ text: "B", callback_data: "b" }]] } });

    expect(() => expectCall(kit, "sendMessage", { reply_markup: { inline_keyboard: [[{ text: "A" }]] } })).toThrow();
    expect(() => expectCall(kit, "sendMessage", { link_preview_options: { is_disabled: true } })).toThrow();
  });
});

describe("expectNoCalls", () => {
  it("passes when the bot stayed silent and fails with the calls otherwise", async () => {
    const kit = withCalls();
    expectNoCalls(kit);

    await kit.api.sendChatAction(1, "typing");

    expect(() => expectNoCalls(kit)).toThrow(/expected no calls, got 1.*sendChatAction/s);
    expectNoCalls(kit, "sendMessage");
    expect(() => expectNoCalls(kit, "sendChatAction")).toThrow(/to sendChatAction/);
  });
});

describe("expectCallbackAnsweredOnce", () => {
  function pressed() {
    const kit = withCalls();
    const query = kit.updates.inlineMessageCallbackQuery("inl-1", "d");
    kit.fake.observeUpdate(query);
    return { kit, id: query.callback_query.id };
  }

  it("passes for exactly one successful answer", async () => {
    const { kit, id } = pressed();
    await kit.api.answerCallbackQuery(id);

    expectCallbackAnsweredOnce(kit, id);
  });

  it("fails when the query was never answered and names the pending ones", () => {
    const { kit, id } = pressed();

    expect(() => expectCallbackAnsweredOnce(kit, id)).toThrow(new RegExp(`never answered; pending: ${id}`));
  });

  it("fails for a double answer even though the second one was rejected", async () => {
    const { kit, id } = pressed();
    await kit.api.answerCallbackQuery(id);
    await kit.api.answerCallbackQuery(id).catch(() => undefined);

    expect(() => expectCallbackAnsweredOnce(kit, id)).toThrow(/answered 2 times/);
  });

  it("fails when the only answer was rejected", async () => {
    const kit = withCalls();
    await kit.api.answerCallbackQuery("unknown").catch(() => undefined);

    expect(() => expectCallbackAnsweredOnce(kit, "unknown")).toThrow(/failed/);
  });
});

describe("expectRenderedText", () => {
  it("returns the visible text of an HTML message", async () => {
    const kit = withCalls();
    await kit.api.sendMessage(ALEX.id, "<b>Task</b>: a &amp; b &lt;c&gt; 😀", { parse_mode: "HTML" });

    const call = expectCall(kit, "sendMessage");

    expect(expectRenderedText(call)).toBe("Task: a & b <c> 😀");
  });

  it("returns plain text as is, drafts and edits included", async () => {
    const kit = withCalls();
    const sent = await kit.api.sendMessage(1, "<not html>");
    await kit.api.editMessageText(1, sent.message_id, "<b>new</b>", { parse_mode: "HTML" });
    await kit.api.sendMessageDraft(1, 1, "thinking");

    expect(expectRenderedText(expectCall(kit, "sendMessage"))).toBe("<not html>");
    expect(expectRenderedText(expectCall(kit, "editMessageText"))).toBe("new");
    expect(expectRenderedText(expectCall(kit, "sendMessageDraft"))).toBe("thinking");
  });

  it("returns the caption of a document", async () => {
    const kit = withCalls();
    await kit.api.sendDocument(1, new InputFile(new Uint8Array([1]), "a.json"), { caption: "<i>Export</i>", parse_mode: "HTML" });

    expect(expectRenderedText(expectCall(kit, "sendDocument"))).toBe("Export");
  });

  it("refuses rich messages and calls without text", async () => {
    const kit = withCalls();
    await kit.api.raw.sendRichMessage({ chat_id: 1, rich_message: { markdown: "# x" } });
    await kit.api.sendChatAction(1, "typing");

    expect(() => expectRenderedText(expectCall(kit, "sendRichMessage"))).toThrow(/rich message/);
    expect(() => expectRenderedText(expectCall(kit, "sendChatAction"))).toThrow(/no text or caption/);
  });
});
