import { describe, expect, it } from "vitest";
import { readAnswerCallbackQuery, readAnswerGuestQuery, readAnswerInlineQuery } from "./queries";
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

function article(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "article",
    id,
    title: "Free time",
    input_message_content: { message_text: "Friday 15:00" },
    ...extra,
  };
}

describe("readAnswerCallbackQuery", () => {
  it("accepts an id alone and the optional fields", () => {
    expect(readAnswerCallbackQuery({ callback_query_id: "q1" })).toEqual({
      callbackQueryId: "q1",
      text: undefined,
      showAlert: false,
    });
    expect(
      readAnswerCallbackQuery({ callback_query_id: "q1", text: "Done", show_alert: true, cache_time: 5, url: "https://t.me/bot?start=x" }),
    ).toMatchObject({ text: "Done", showAlert: true });
  });

  it("requires the query id", () => {
    expect(rejection(() => readAnswerCallbackQuery({})).errorCode).toBe(400);
    expect(rejection(() => readAnswerCallbackQuery({ callback_query_id: "" })).errorCode).toBe(400);
  });

  it("limits the text to 200 characters", () => {
    expect(readAnswerCallbackQuery({ callback_query_id: "q", text: "a".repeat(200) }).text).toHaveLength(200);
    expect(rejection(() => readAnswerCallbackQuery({ callback_query_id: "q", text: "a".repeat(201) })).description).toBe(
      "Bad Request: MESSAGE_TOO_LONG",
    );
  });

  it("validates cache_time and show_alert", () => {
    expect(rejection(() => readAnswerCallbackQuery({ callback_query_id: "q", cache_time: -1 })).errorCode).toBe(400);
    expect(rejection(() => readAnswerCallbackQuery({ callback_query_id: "q", show_alert: "yes" })).errorCode).toBe(400);
  });
});

describe("readAnswerInlineQuery", () => {
  it("accepts up to 50 results with unique ids", () => {
    const results = Array.from({ length: 50 }, (_, i) => article(`r${i}`));
    expect(readAnswerInlineQuery({ inline_query_id: "iq", results }).results).toHaveLength(50);
    expect(readAnswerInlineQuery({ inline_query_id: "iq", results: [] }).results).toHaveLength(0);
  });

  it("rejects more than 50 results", () => {
    const results = Array.from({ length: 51 }, (_, i) => article(`r${i}`));
    expect(rejection(() => readAnswerInlineQuery({ inline_query_id: "iq", results })).description).toBe(
      "Bad Request: RESULTS_TOO_MUCH",
    );
  });

  it("requires the query id and a results array", () => {
    expect(rejection(() => readAnswerInlineQuery({ results: [] })).errorCode).toBe(400);
    expect(rejection(() => readAnswerInlineQuery({ inline_query_id: "iq" })).errorCode).toBe(400);
    expect(rejection(() => readAnswerInlineQuery({ inline_query_id: "iq", results: "x" })).errorCode).toBe(400);
  });

  it("rejects duplicate ids and ids outside 1-64 bytes", () => {
    expect(rejection(() => readAnswerInlineQuery({ inline_query_id: "iq", results: [article("a"), article("a")] })).description)
      .toMatch(/duplicate/);
    expect(rejection(() => readAnswerInlineQuery({ inline_query_id: "iq", results: [article("")] })).errorCode).toBe(400);
    expect(readAnswerInlineQuery({ inline_query_id: "iq", results: [article("x".repeat(64))] })).toBeDefined();
    expect(rejection(() => readAnswerInlineQuery({ inline_query_id: "iq", results: [article("x".repeat(65))] })).errorCode)
      .toBe(400);
    // 33 Cyrillic letters are 66 bytes.
    expect(rejection(() => readAnswerInlineQuery({ inline_query_id: "iq", results: [article("я".repeat(33))] })).errorCode)
      .toBe(400);
  });

  it("validates cache_time, is_personal and next_offset", () => {
    const base = { inline_query_id: "iq", results: [] };
    expect(readAnswerInlineQuery({ ...base, cache_time: 0, is_personal: true, next_offset: "" })).toMatchObject({});
    expect(rejection(() => readAnswerInlineQuery({ ...base, cache_time: -1 })).errorCode).toBe(400);
    expect(rejection(() => readAnswerInlineQuery({ ...base, cache_time: 1.5 })).errorCode).toBe(400);
    expect(rejection(() => readAnswerInlineQuery({ ...base, is_personal: "yes" })).errorCode).toBe(400);
    expect(rejection(() => readAnswerInlineQuery({ ...base, next_offset: "x".repeat(65) })).errorCode).toBe(400);
  });

  it("accepts a start_parameter button or a web_app button, exactly one", () => {
    const base = { inline_query_id: "iq", results: [] };
    expect(readAnswerInlineQuery({ ...base, button: { text: "Connect", start_parameter: "connect_calendar" } })).toBeDefined();
    expect(readAnswerInlineQuery({ ...base, button: { text: "Open", web_app: { url: "https://app.example.com" } } })).toBeDefined();
    expect(rejection(() => readAnswerInlineQuery({ ...base, button: { text: "x" } })).errorCode).toBe(400);
    expect(
      rejection(() =>
        readAnswerInlineQuery({
          ...base,
          button: { text: "x", start_parameter: "a", web_app: { url: "https://app.example.com" } },
        }),
      ).errorCode,
    ).toBe(400);
    expect(rejection(() => readAnswerInlineQuery({ ...base, button: { text: "", start_parameter: "a" } })).errorCode).toBe(400);
  });

  it.each(["", "a b", "a".repeat(65), "привет", "a.b"])("rejects start_parameter %j", (parameter) => {
    expect(
      rejection(() =>
        readAnswerInlineQuery({ inline_query_id: "iq", results: [], button: { text: "x", start_parameter: parameter } }),
      ).errorCode,
    ).toBe(400);
  });

  it("requires https for a web_app button", () => {
    expect(
      rejection(() =>
        readAnswerInlineQuery({
          inline_query_id: "iq",
          results: [],
          button: { text: "x", web_app: { url: "http://app.example.com" } },
        }),
      ).errorCode,
    ).toBe(400);
  });
});

describe("inline query results", () => {
  function one(result: unknown) {
    return readAnswerInlineQuery({ inline_query_id: "iq", results: [result] });
  }

  it("validates the message text of an article like sendMessage", () => {
    expect(one(article("a", { input_message_content: { message_text: "<b>x</b>", parse_mode: "HTML" } }))).toBeDefined();
    expect(
      rejection(() => one(article("a", { input_message_content: { message_text: "a".repeat(4097) } }))).description,
    ).toBe("Bad Request: message is too long");
    expect(
      rejection(() => one(article("a", { input_message_content: { message_text: "<div>", parse_mode: "HTML" } })))
        .description,
    ).toMatch(/^Bad Request: can't parse entities/);
    expect(rejection(() => one(article("a", { input_message_content: { message_text: "" } }))).errorCode).toBe(400);
  });

  it("requires a title and a message content for an article", () => {
    expect(rejection(() => one({ type: "article", id: "a", input_message_content: { message_text: "x" } })).errorCode).toBe(400);
    expect(rejection(() => one({ type: "article", id: "a", title: "T" })).errorCode).toBe(400);
  });

  it("accepts rich, location, venue and contact contents and rejects invoices", () => {
    expect(one(article("a", { input_message_content: { rich_message: { markdown: "# x" } } }))).toBeDefined();
    expect(one(article("a", { input_message_content: { latitude: 1, longitude: 2 } }))).toBeDefined();
    expect(
      one(article("a", { input_message_content: { latitude: 1, longitude: 2, title: "T", address: "A" } })),
    ).toBeDefined();
    expect(one(article("a", { input_message_content: { phone_number: "+100", first_name: "A" } }))).toBeDefined();
    expect(rejection(() => one(article("a", { input_message_content: { title: "T", payload: "p" } }))).errorCode).toBe(400);
  });

  it("validates the keyboard of a result", () => {
    const tooLong = { inline_keyboard: [[{ text: "Go", callback_data: "a".repeat(65) }]] };
    expect(rejection(() => one(article("a", { reply_markup: tooLong }))).description).toBe("Bad Request: BUTTON_DATA_INVALID");
    expect(
      one(article("a", { reply_markup: { inline_keyboard: [[{ text: "Go", callback_data: "ok" }]] } })),
    ).toBeDefined();
  });

  it("rejects an unknown result type", () => {
    expect(rejection(() => one({ type: "widget", id: "a" })).errorCode).toBe(400);
    expect(rejection(() => one("article")).errorCode).toBe(400);
  });

  it.each([
    { type: "photo", photo_url: "https://e.com/a.jpg", thumbnail_url: "https://e.com/t.jpg" },
    { type: "photo", photo_file_id: "f" },
    { type: "gif", gif_url: "https://e.com/a.gif", thumbnail_url: "https://e.com/t.jpg" },
    { type: "video", video_url: "https://e.com/a.mp4", mime_type: "video/mp4", thumbnail_url: "https://e.com/t.jpg", title: "T" },
    { type: "document", title: "T", document_url: "https://e.com/a.pdf", mime_type: "application/pdf" },
    { type: "location", latitude: 1, longitude: 2, title: "T" },
    { type: "venue", latitude: 1, longitude: 2, title: "T", address: "A" },
    { type: "contact", phone_number: "+1", first_name: "A" },
    { type: "game", game_short_name: "g" },
    { type: "sticker", sticker_file_id: "s" },
  ])("accepts the required fields of %j", (result) => {
    expect(one({ id: "r", ...result })).toBeDefined();
  });

  it.each([
    { type: "photo", photo_url: "https://e.com/a.jpg" },
    { type: "video", video_url: "https://e.com/a.mp4", title: "T" },
    { type: "location", latitude: 1, title: "T" },
    { type: "contact", phone_number: "+1" },
  ])("rejects missing fields of %j", (result) => {
    expect(rejection(() => one({ id: "r", ...result })).errorCode).toBe(400);
  });

  it("limits a caption to 1024 characters", () => {
    expect(
      rejection(() => one({ id: "r", type: "photo", photo_file_id: "f", caption: "a".repeat(1025) })).description,
    ).toBe("Bad Request: message caption is too long");
  });
});

describe("readAnswerGuestQuery", () => {
  it("accepts a guest query id with one result", () => {
    expect(readAnswerGuestQuery({ guest_query_id: "g1", result: article("a") })).toMatchObject({ guestQueryId: "g1" });
  });

  it("requires the id and a valid result", () => {
    expect(rejection(() => readAnswerGuestQuery({ result: article("a") })).errorCode).toBe(400);
    expect(rejection(() => readAnswerGuestQuery({ guest_query_id: "g1" })).errorCode).toBe(400);
    expect(
      rejection(() => readAnswerGuestQuery({ guest_query_id: "g1", result: article("a", { title: "" }) })).errorCode,
    ).toBe(400);
  });
});
