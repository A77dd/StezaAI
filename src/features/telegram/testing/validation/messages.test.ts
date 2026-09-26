import { InputFile } from "grammy";
import { describe, expect, it } from "vitest";
import {
  readDeleteMessage,
  readDeleteMessages,
  readEditMessageReplyMarkup,
  readEditMessageText,
  readSendDocument,
  readSendMessage,
  readSendMessageDraft,
  readSendRichMessage,
} from "./messages";
import { ApiRejection } from "./rejection";

function rejection(action: () => unknown): ApiRejection {
  try {
    action();
  } catch (error) {
    if (error instanceof ApiRejection) return error;
    throw error;
  }
  throw new Error("expected an ApiRejection");
}

const lookup = () => undefined;
const keyboard = { inline_keyboard: [[{ text: "Go", callback_data: "a" }]] };

describe("readSendMessage", () => {
  it("returns the parsed text, params and link preview", () => {
    const request = readSendMessage(
      {
        chat_id: 100,
        text: "<b>hi</b>",
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: keyboard,
      },
      lookup,
    );

    expect(request.text.text).toBe("hi");
    expect(request.params.chat).toEqual({ kind: "private", id: 100 });
    expect(request.params.replyMarkup).toEqual(keyboard);
    expect(request.linkPreview).toEqual({ is_disabled: true });
  });

  it("rejects an invalid text before anything else", () => {
    expect(rejection(() => readSendMessage({ chat_id: 100 }, lookup)).description).toBe(
      "Bad Request: message text is empty",
    );
  });

  it("rejects a callback_data over 64 bytes in the keyboard", () => {
    const tooLong = { inline_keyboard: [[{ text: "Go", callback_data: "a".repeat(65) }]] };
    expect(rejection(() => readSendMessage({ chat_id: 100, text: "x", reply_markup: tooLong }, lookup)).description).toBe(
      "Bad Request: BUTTON_DATA_INVALID",
    );
  });
});

describe("readSendRichMessage", () => {
  it("accepts exactly one of html, markdown or blocks", () => {
    expect(readSendRichMessage({ chat_id: 100, rich_message: { markdown: "# Title" } }, lookup).rich).toEqual({
      markdown: "# Title",
    });
    expect(readSendRichMessage({ chat_id: 100, rich_message: { html: "<h1>x</h1>" } }, lookup).rich).toEqual({
      html: "<h1>x</h1>",
    });
    expect(
      readSendRichMessage({ chat_id: 100, rich_message: { blocks: [{ type: "divider" }] } }, lookup).rich,
    ).toEqual({ blocks: [{ type: "divider" }] });
  });

  it("rejects none or several of them, and a missing message", () => {
    expect(rejection(() => readSendRichMessage({ chat_id: 100, rich_message: {} }, lookup)).description).toMatch(
      /exactly one of html, markdown or blocks/,
    );
    expect(
      rejection(() => readSendRichMessage({ chat_id: 100, rich_message: { html: "a", markdown: "b" } }, lookup))
        .errorCode,
    ).toBe(400);
    expect(rejection(() => readSendRichMessage({ chat_id: 100 }, lookup)).errorCode).toBe(400);
    expect(rejection(() => readSendRichMessage({ chat_id: 100, rich_message: { markdown: "" } }, lookup)).errorCode).toBe(
      400,
    );
    expect(rejection(() => readSendRichMessage({ chat_id: 100, rich_message: { blocks: [] } }, lookup)).errorCode).toBe(
      400,
    );
  });

  it("accepts 32768 characters and rejects 32769", () => {
    expect(readSendRichMessage({ chat_id: 100, rich_message: { markdown: "a".repeat(32768) } }, lookup)).toBeDefined();
    expect(
      rejection(() => readSendRichMessage({ chat_id: 100, rich_message: { markdown: "a".repeat(32769) } }, lookup)),
    ).toMatchObject({ errorCode: 400, description: "Bad Request: message is too long" });
  });

  it("validates the keyboard", () => {
    const request = readSendRichMessage({ chat_id: 100, rich_message: { markdown: "x" }, reply_markup: keyboard }, lookup);
    expect(request.params.replyMarkup).toEqual(keyboard);
  });
});

describe("readSendMessageDraft", () => {
  const valid = { chat_id: 100, draft_id: 5, text: "Looking for time..." };

  it("accepts a private chat draft", () => {
    expect(readSendMessageDraft({ ...valid, can_stop: true })).toMatchObject({
      chatId: 100,
      draftId: 5,
      canStop: true,
      keepOnStop: false,
      text: { text: "Looking for time..." },
    });
  });

  it("rejects group chats and public chats", () => {
    expect(rejection(() => readSendMessageDraft({ ...valid, chat_id: -100 })).description).toMatch(/private chat/);
    expect(rejection(() => readSendMessageDraft({ ...valid, chat_id: "@some_channel" })).errorCode).toBe(400);
  });

  it.each([0, undefined, 1.5, "1"])("rejects draft_id %j", (draftId) => {
    expect(rejection(() => readSendMessageDraft({ ...valid, draft_id: draftId })).description).toMatch(/draft_id/);
  });

  it("accepts an empty or missing text (Thinking...) and up to 4096 characters", () => {
    expect(readSendMessageDraft({ chat_id: 100, draft_id: 1 }).text.text).toBe("");
    expect(readSendMessageDraft({ chat_id: 100, draft_id: 1, text: "" }).text.text).toBe("");
    expect(readSendMessageDraft({ ...valid, text: "a".repeat(4096) }).text.text).toHaveLength(4096);
    expect(rejection(() => readSendMessageDraft({ ...valid, text: "a".repeat(4097) })).description).toBe(
      "Bad Request: message is too long",
    );
  });

  it("parses HTML like sendMessage", () => {
    expect(rejection(() => readSendMessageDraft({ ...valid, text: "<div>", parse_mode: "HTML" })).description).toMatch(
      /^Bad Request: can't parse entities/,
    );
  });

  it("validates the boolean flags and the thread", () => {
    expect(rejection(() => readSendMessageDraft({ ...valid, can_stop: "yes" })).errorCode).toBe(400);
    expect(rejection(() => readSendMessageDraft({ ...valid, keep_on_stop: 1 })).errorCode).toBe(400);
    expect(readSendMessageDraft({ ...valid, message_thread_id: 9 }).threadId).toBe(9);
  });
});

describe("readEditMessageText", () => {
  it("accepts a chat message target", () => {
    const request = readEditMessageText({ chat_id: 100, message_id: 3, text: "new", reply_markup: keyboard });
    expect(request.target).toEqual({ kind: "chat", chatId: 100, messageId: 3 });
    expect(request.content).toMatchObject({ kind: "text", text: { text: "new" } });
    expect(request.markup).toEqual(keyboard);
  });

  it("accepts an inline message target", () => {
    expect(readEditMessageText({ inline_message_id: "abc", text: "new" }).target).toEqual({
      kind: "inline",
      inlineMessageId: "abc",
    });
  });

  it("requires a target and rejects two", () => {
    expect(rejection(() => readEditMessageText({ text: "x" })).description).toBe(
      "Bad Request: message identifier is not specified",
    );
    expect(rejection(() => readEditMessageText({ chat_id: 100, text: "x" })).description).toBe(
      "Bad Request: message identifier is not specified",
    );
    expect(
      rejection(() => readEditMessageText({ chat_id: 100, message_id: 1, inline_message_id: "a", text: "x" })).errorCode,
    ).toBe(400);
  });

  it("requires exactly one of text and rich_message", () => {
    expect(rejection(() => readEditMessageText({ chat_id: 100, message_id: 1 })).description).toBe(
      "Bad Request: message text is empty",
    );
    expect(
      rejection(() => readEditMessageText({ chat_id: 100, message_id: 1, text: "x", rich_message: { markdown: "y" } }))
        .errorCode,
    ).toBe(400);
    expect(
      readEditMessageText({ chat_id: 100, message_id: 1, rich_message: { markdown: "y" } }).content,
    ).toEqual({ kind: "rich", rich: { markdown: "y" } });
  });

  it("treats a missing reply_markup as removing the keyboard", () => {
    expect(readEditMessageText({ chat_id: 100, message_id: 1, text: "x" }).markup).toBeNull();
    expect(
      readEditMessageText({ chat_id: 100, message_id: 1, text: "x", reply_markup: { inline_keyboard: [] } }).markup,
    ).toBeNull();
  });

  it("accepts inline keyboards only", () => {
    expect(
      rejection(() => readEditMessageText({ chat_id: 100, message_id: 1, text: "x", reply_markup: { remove_keyboard: true } }))
        .errorCode,
    ).toBe(400);
  });

  it("validates text and markup like sendMessage", () => {
    expect(
      rejection(() => readEditMessageText({ chat_id: 100, message_id: 1, text: "<b>x", parse_mode: "HTML" })).description,
    ).toMatch(/^Bad Request: can't parse entities/);
    expect(
      rejection(() => readEditMessageText({ chat_id: 100, message_id: 1, text: "x".repeat(4097) })).description,
    ).toBe("Bad Request: message is too long");
  });
});

describe("readEditMessageReplyMarkup", () => {
  it("returns the target and the keyboard", () => {
    expect(readEditMessageReplyMarkup({ chat_id: 100, message_id: 3, reply_markup: keyboard })).toEqual({
      target: { kind: "chat", chatId: 100, messageId: 3 },
      markup: keyboard,
    });
  });

  it("treats a missing keyboard as removing it", () => {
    expect(readEditMessageReplyMarkup({ chat_id: 100, message_id: 3 }).markup).toBeNull();
  });

  it("requires a target", () => {
    expect(rejection(() => readEditMessageReplyMarkup({ reply_markup: keyboard })).errorCode).toBe(400);
  });
});

describe("readDeleteMessage and readDeleteMessages", () => {
  it("reads a single message", () => {
    expect(readDeleteMessage({ chat_id: 100, message_id: 4 })).toEqual({ chatId: 100, messageId: 4 });
    expect(rejection(() => readDeleteMessage({ chat_id: 100 })).description).toBe(
      "Bad Request: message identifier is not specified",
    );
  });

  it("reads 1 to 100 identifiers", () => {
    expect(readDeleteMessages({ chat_id: 100, message_ids: [1, 2] })).toEqual({ chatId: 100, messageIds: [1, 2] });
    expect(readDeleteMessages({ chat_id: 100, message_ids: Array.from({ length: 100 }, (_, i) => i + 1) }).messageIds)
      .toHaveLength(100);
    expect(rejection(() => readDeleteMessages({ chat_id: 100, message_ids: [] })).errorCode).toBe(400);
    expect(
      rejection(() => readDeleteMessages({ chat_id: 100, message_ids: Array.from({ length: 101 }, (_, i) => i + 1) }))
        .errorCode,
    ).toBe(400);
    expect(rejection(() => readDeleteMessages({ chat_id: 100, message_ids: [0] })).errorCode).toBe(400);
    expect(rejection(() => readDeleteMessages({ chat_id: 100, message_ids: "1" })).errorCode).toBe(400);
  });
});

describe("readSendDocument", () => {
  const knowsFile = (fileId: string) => fileId === "file-1";

  it("accepts an upload with a caption", () => {
    const file = new InputFile(new Uint8Array([1, 2, 3]), "export.json");
    const request = readSendDocument({ chat_id: 100, document: file, caption: "Your data" }, lookup, knowsFile);

    expect(request.document).toEqual({ kind: "upload", file });
    expect(request.caption?.text).toBe("Your data");
  });

  it("accepts a known file_id and a pdf or zip url", () => {
    expect(readSendDocument({ chat_id: 100, document: "file-1" }, lookup, knowsFile).document).toEqual({
      kind: "file_id",
      fileId: "file-1",
    });
    expect(readSendDocument({ chat_id: 100, document: "https://example.com/a.pdf" }, lookup, knowsFile).document).toEqual({
      kind: "url",
      url: "https://example.com/a.pdf",
    });
  });

  it("rejects an unknown file_id, other urls and a missing document", () => {
    expect(rejection(() => readSendDocument({ chat_id: 100, document: "nope" }, lookup, knowsFile)).description).toBe(
      "Bad Request: wrong file identifier/HTTP URL specified",
    );
    expect(
      rejection(() => readSendDocument({ chat_id: 100, document: "https://example.com/a.txt" }, lookup, knowsFile))
        .description,
    ).toBe("Bad Request: wrong type of the web page content");
    expect(rejection(() => readSendDocument({ chat_id: 100 }, lookup, knowsFile)).description).toBe(
      "Bad Request: there is no document in the request",
    );
    expect(rejection(() => readSendDocument({ chat_id: 100, document: 5 }, lookup, knowsFile)).errorCode).toBe(400);
  });

  it("limits the caption to 1024 characters", () => {
    expect(
      rejection(() => readSendDocument({ chat_id: 100, document: "file-1", caption: "a".repeat(1025) }, lookup, knowsFile))
        .description,
    ).toBe("Bad Request: message caption is too long");
  });
});
