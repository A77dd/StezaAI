import { describe, expect, it } from "vitest";
import { assertInlineKeyboard, assertReplyMarkup, normalizeInlineMarkup } from "./keyboard";
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

function inline(...rows: unknown[][]): { inline_keyboard: unknown[][] } {
  return { inline_keyboard: rows };
}

function button(fields: Record<string, unknown>): unknown {
  return { text: "Go", ...fields };
}

function check(markup: unknown, context = {}): ApiRejection {
  return rejection(() => assertInlineKeyboard(markup, context));
}

describe("assertInlineKeyboard: accepted buttons", () => {
  it.each([
    ["callback_data", { callback_data: "v1:a:1" }],
    ["url", { url: "https://example.com" }],
    ["http url", { url: "http://example.com" }],
    ["tg url", { url: "tg://user?id=123" }],
    ["web_app", { web_app: { url: "https://app.example.com" } }],
    ["login_url", { login_url: { url: "https://example.com/login", request_write_access: true } }],
    ["copy_text", { copy_text: { text: "x".repeat(256) } }],
    ["disabled", { disabled: {} }],
    ["switch_inline_query", { switch_inline_query: "" }],
    ["switch_inline_query_current_chat", { switch_inline_query_current_chat: "free" }],
    [
      "switch_inline_query_chosen_chat",
      { switch_inline_query_chosen_chat: { query: "q", allow_user_chats: true } },
    ],
    ["style primary", { callback_data: "a", style: "primary" }],
    ["style success", { callback_data: "a", style: "success" }],
    ["style danger", { callback_data: "a", style: "danger" }],
    ["icon_custom_emoji_id", { callback_data: "a", icon_custom_emoji_id: "5368324170671202286" }],
  ])("accepts %s", (_name, fields) => {
    expect(() => assertInlineKeyboard(inline([button(fields)]))).not.toThrow();
  });

  it("accepts an empty keyboard, an empty row and force_reply", () => {
    expect(() => assertInlineKeyboard({ inline_keyboard: [] })).not.toThrow();
    expect(() => assertInlineKeyboard({ inline_keyboard: [[]] })).not.toThrow();
    expect(() => assertInlineKeyboard({ inline_keyboard: [], force_reply: true })).not.toThrow();
  });
});

describe("assertInlineKeyboard: button actions", () => {
  it("rejects a button without an action", () => {
    expect(check(inline([{ text: "Go" }]))).toMatchObject({
      errorCode: 400,
      description: "Bad Request: text buttons are unallowed in the inline keyboard",
    });
  });

  it("rejects a button with two actions", () => {
    expect(check(inline([button({ callback_data: "a", url: "https://example.com" })])).description).toMatch(
      /exactly one/,
    );
  });

  it("rejects an empty label", () => {
    expect(check(inline([{ text: "", callback_data: "a" }])).errorCode).toBe(400);
    expect(check(inline([{ callback_data: "a" }])).errorCode).toBe(400);
  });

  it("limits callback_data to 1-64 bytes, not characters", () => {
    expect(() => assertInlineKeyboard(inline([button({ callback_data: "a".repeat(64) })]))).not.toThrow();
    expect(check(inline([button({ callback_data: "a".repeat(65) })]))).toMatchObject({
      errorCode: 400,
      description: "Bad Request: BUTTON_DATA_INVALID",
    });
    expect(check(inline([button({ callback_data: "" })])).description).toBe("Bad Request: BUTTON_DATA_INVALID");
    // 32 Cyrillic letters are 64 bytes, 33 are 66.
    expect(() => assertInlineKeyboard(inline([button({ callback_data: "я".repeat(32) })]))).not.toThrow();
    expect(check(inline([button({ callback_data: "я".repeat(33) })])).description).toBe(
      "Bad Request: BUTTON_DATA_INVALID",
    );
  });

  it.each(["ftp://example.com", "not a url", "javascript:alert(1)", "", "example.com"])(
    "rejects url %j",
    (url) => {
      expect(check(inline([button({ url })])).description).toBe("Bad Request: BUTTON_URL_INVALID");
    },
  );

  it("requires https for web_app and login_url", () => {
    expect(check(inline([button({ web_app: { url: "http://app.example.com" } })])).description).toBe(
      "Bad Request: BUTTON_URL_INVALID",
    );
    expect(check(inline([button({ login_url: { url: "http://example.com" } })])).description).toBe(
      "Bad Request: BUTTON_URL_INVALID",
    );
    expect(check(inline([button({ web_app: "https://app.example.com" })])).errorCode).toBe(400);
  });

  it("allows web_app only in private chats", () => {
    const markup = inline([button({ web_app: { url: "https://app.example.com" } })]);
    expect(() => assertInlineKeyboard(markup, { chatKind: "private" })).not.toThrow();
    expect(check(markup, { chatKind: "group" }).description).toMatch(/private chats/);
  });

  it("does not support login_url in ephemeral messages", () => {
    const markup = inline([button({ login_url: { url: "https://example.com/login" } })]);
    expect(() => assertInlineKeyboard(markup, { ephemeral: false })).not.toThrow();
    expect(check(markup, { ephemeral: true }).description).toMatch(/ephemeral/);
  });

  it("limits copy_text to 1-256 characters", () => {
    expect(check(inline([button({ copy_text: { text: "" } })])).errorCode).toBe(400);
    expect(check(inline([button({ copy_text: { text: "x".repeat(257) } })])).errorCode).toBe(400);
    expect(check(inline([button({ copy_text: "abc" })])).errorCode).toBe(400);
  });

  it("rejects unknown styles", () => {
    expect(check(inline([button({ callback_data: "a", style: "link" })])).errorCode).toBe(400);
    expect(check(inline([button({ callback_data: "a", style: "red" })])).errorCode).toBe(400);
  });

  it("requires an allowed chat kind for switch_inline_query_chosen_chat", () => {
    expect(check(inline([button({ switch_inline_query_chosen_chat: {} })])).errorCode).toBe(400);
  });

  it("rejects buttons that need an invoice or a game", () => {
    expect(check(inline([button({ pay: true })])).errorCode).toBe(400);
    expect(check(inline([button({ callback_game: {} })])).errorCode).toBe(400);
  });

  it("rejects a disabled button that is not an object", () => {
    expect(check(inline([button({ disabled: true })])).errorCode).toBe(400);
  });
});

describe("assertInlineKeyboard: shape and size limits", () => {
  it("accepts 100 buttons and rejects 101", () => {
    const row = (count: number) => Array.from({ length: count }, (_, i) => button({ callback_data: `d${i}` }));
    const rows = (total: number) => Array.from({ length: total / 4 }, () => row(4));
    expect(() => assertInlineKeyboard(inline(...rows(100)))).not.toThrow();
    expect(check(inline(...rows(100), row(1)))).toMatchObject({
      errorCode: 400,
      description: "Bad Request: REPLY_MARKUP_TOO_LONG",
    });
  });

  it("accepts 8 buttons per row and rejects 9", () => {
    const row = (count: number) => Array.from({ length: count }, (_, i) => button({ callback_data: `d${i}` }));
    expect(() => assertInlineKeyboard(inline(row(8)))).not.toThrow();
    expect(check(inline(row(9))).description).toBe("Bad Request: REPLY_MARKUP_TOO_LONG");
  });

  it.each([
    ["not an object", "keyboard"],
    ["no inline_keyboard", {}],
    ["rows not an array", { inline_keyboard: "x" }],
    ["a row that is not an array", { inline_keyboard: ["x"] }],
    ["a button that is not an object", { inline_keyboard: [["x"]] }],
    ["a non boolean force_reply", { inline_keyboard: [], force_reply: "yes" }],
  ])("rejects %s", (_name, markup) => {
    expect(check(markup).errorCode).toBe(400);
  });
});

describe("normalizeInlineMarkup", () => {
  it("treats no buttons as no keyboard", () => {
    expect(normalizeInlineMarkup({ inline_keyboard: [] })).toBeNull();
    expect(normalizeInlineMarkup({ inline_keyboard: [[], []] })).toBeNull();
  });

  it("drops empty rows and keeps the rest", () => {
    expect(
      normalizeInlineMarkup({ inline_keyboard: [[], [{ text: "a", callback_data: "1" }]] }),
    ).toEqual({ inline_keyboard: [[{ text: "a", callback_data: "1" }]] });
  });
});

describe("assertReplyMarkup", () => {
  function replyCheck(markup: unknown, context = {}): ApiRejection {
    return rejection(() => assertReplyMarkup(markup, context));
  }

  it("accepts an inline keyboard, a reply keyboard, a removal and a force reply", () => {
    expect(() => assertReplyMarkup(inline([button({ callback_data: "a" })]))).not.toThrow();
    expect(() => assertReplyMarkup({ keyboard: [["one", { text: "two" }]], resize_keyboard: true })).not.toThrow();
    expect(() => assertReplyMarkup({ remove_keyboard: true })).not.toThrow();
    expect(() => assertReplyMarkup({ force_reply: true, input_field_placeholder: "Type" })).not.toThrow();
  });

  it("rejects an object that is none of them, or several at once", () => {
    expect(replyCheck({}).errorCode).toBe(400);
    expect(replyCheck({ keyboard: [["a"]], remove_keyboard: true }).errorCode).toBe(400);
    expect(replyCheck("markup").errorCode).toBe(400);
  });

  it("validates the inline keyboard inside", () => {
    expect(replyCheck(inline([button({ callback_data: "a".repeat(65) })])).description).toBe(
      "Bad Request: BUTTON_DATA_INVALID",
    );
  });

  it("validates reply keyboard buttons and the placeholder", () => {
    expect(replyCheck({ keyboard: [[""]] }).errorCode).toBe(400);
    expect(replyCheck({ keyboard: [[{ text: "" }]] }).errorCode).toBe(400);
    expect(replyCheck({ keyboard: [[{ text: "a", request_contact: true, request_location: true }]] }).errorCode).toBe(
      400,
    );
    expect(replyCheck({ keyboard: [["a"]], input_field_placeholder: "x".repeat(65) }).errorCode).toBe(400);
    expect(replyCheck({ force_reply: true, input_field_placeholder: "" }).errorCode).toBe(400);
    expect(replyCheck({ remove_keyboard: false }).errorCode).toBe(400);
  });

  it("allows contact and web app reply buttons only in private chats", () => {
    const contact = { keyboard: [[{ text: "Share", request_contact: true }]] };
    expect(() => assertReplyMarkup(contact, { chatKind: "private" })).not.toThrow();
    expect(replyCheck(contact, { chatKind: "group" }).description).toMatch(/private chats/);
  });
});
