import { describe, expect, it } from "vitest";
import { ApiRejection } from "./rejection";
import { readLinkPreviewOptions, readMessageText, readOptionalCaption } from "./text";

function rejection(action: () => unknown): ApiRejection {
  try {
    action();
  } catch (error) {
    if (error instanceof ApiRejection) return error;
    throw error;
  }
  throw new Error("expected an ApiRejection");
}

describe("readMessageText", () => {
  it("accepts plain text", () => {
    expect(readMessageText({ text: "hello" })).toEqual({ text: "hello", entities: [] });
  });

  it("parses HTML into visible text and entities", () => {
    expect(readMessageText({ text: "<b>hi</b> &amp; bye", parse_mode: "HTML" })).toEqual({
      text: "hi & bye",
      entities: [{ type: "bold", offset: 0, length: 2 }],
    });
  });

  it("does not parse markup without a parse mode", () => {
    expect(readMessageText({ text: "<b>hi</b>" }).text).toBe("<b>hi</b>");
  });

  it("accepts explicit entities", () => {
    expect(
      readMessageText({ text: "hello", entities: [{ type: "bold", offset: 0, length: 5 }] }).entities,
    ).toHaveLength(1);
  });

  it("rejects a missing or blank text", () => {
    expect(rejection(() => readMessageText({}))).toMatchObject({
      errorCode: 400,
      description: "Bad Request: message text is empty",
    });
    expect(rejection(() => readMessageText({ text: "" })).description).toBe(
      "Bad Request: message text is empty",
    );
    expect(rejection(() => readMessageText({ text: "  \n " })).description).toBe(
      "Bad Request: message text is empty",
    );
  });

  it("rejects text that is empty once the markup is parsed", () => {
    expect(
      rejection(() => readMessageText({ text: "<b></b>", parse_mode: "HTML" })).description,
    ).toBe("Bad Request: message text is empty");
  });

  it("accepts 4096 UTF-16 code units and rejects 4097", () => {
    expect(readMessageText({ text: "a".repeat(4096) }).text).toHaveLength(4096);
    expect(rejection(() => readMessageText({ text: "a".repeat(4097) }))).toMatchObject({
      errorCode: 400,
      description: "Bad Request: message is too long",
    });
  });

  it("counts an emoji as two code units", () => {
    expect(readMessageText({ text: "😀".repeat(2048) }).text).toHaveLength(4096);
    expect(rejection(() => readMessageText({ text: "😀".repeat(2049) })).description).toBe(
      "Bad Request: message is too long",
    );
  });

  it("measures the limit after entity parsing, not on the markup", () => {
    const markup = "<b>" + "a".repeat(4096) + "</b>";
    expect(markup.length).toBeGreaterThan(4096);
    expect(readMessageText({ text: markup, parse_mode: "HTML" }).text).toHaveLength(4096);
    expect(
      rejection(() => readMessageText({ text: "<b>" + "a".repeat(4097) + "</b>", parse_mode: "HTML" }))
        .description,
    ).toBe("Bad Request: message is too long");
  });

  it("reports parse failures as can't parse entities", () => {
    expect(rejection(() => readMessageText({ text: "<div>x</div>", parse_mode: "HTML" }))).toMatchObject({
      errorCode: 400,
      description: `Bad Request: can't parse entities: Unsupported start tag "div" at byte offset 0`,
    });
    expect(
      rejection(() => readMessageText({ text: "a&nbsp;b", parse_mode: "HTML" })).description,
    ).toMatch(/^Bad Request: can't parse entities: /);
    expect(
      rejection(() =>
        readMessageText({ text: "abc", entities: [{ type: "bold", offset: 0, length: 9 }] }),
      ).description,
    ).toMatch(/^Bad Request: can't parse entities: /);
  });

  it("rejects an unknown parse mode and one the fake does not model", () => {
    expect(rejection(() => readMessageText({ text: "x", parse_mode: "html" })).description).toBe(
      "Bad Request: unsupported parse_mode",
    );
    expect(rejection(() => readMessageText({ text: "x", parse_mode: "MarkdownV2" })).description).toMatch(
      /does not model parse_mode MarkdownV2/,
    );
    expect(rejection(() => readMessageText({ text: "x", parse_mode: "Markdown" })).errorCode).toBe(400);
  });

  it("rejects parse_mode together with entities but ignores an empty entity list", () => {
    expect(
      rejection(() =>
        readMessageText({
          text: "x",
          parse_mode: "HTML",
          entities: [{ type: "bold", offset: 0, length: 1 }],
        }),
      ).description,
    ).toMatch(/parse_mode and entities/);
    expect(readMessageText({ text: "x", parse_mode: "HTML", entities: [] }).text).toBe("x");
  });

  it("rejects values of the wrong type", () => {
    expect(rejection(() => readMessageText({ text: 5 })).errorCode).toBe(400);
    expect(rejection(() => readMessageText({ text: "x", parse_mode: 5 })).errorCode).toBe(400);
  });
});

describe("readOptionalCaption", () => {
  it("returns nothing when there is no caption", () => {
    expect(readOptionalCaption({})).toBeUndefined();
  });

  it("accepts up to 1024 code units and rejects more", () => {
    expect(readOptionalCaption({ caption: "a".repeat(1024) })?.text).toHaveLength(1024);
    expect(rejection(() => readOptionalCaption({ caption: "a".repeat(1025) })).description).toBe(
      "Bad Request: message caption is too long",
    );
  });

  it("uses caption_entities and the shared parse mode", () => {
    expect(readOptionalCaption({ caption: "<i>x</i>", parse_mode: "HTML" })?.entities).toEqual([
      { type: "italic", offset: 0, length: 1 },
    ]);
    expect(
      readOptionalCaption({ caption: "x", caption_entities: [{ type: "bold", offset: 0, length: 1 }] })
        ?.entities,
    ).toHaveLength(1);
  });
});

describe("readLinkPreviewOptions", () => {
  it("accepts the documented fields", () => {
    expect(
      readLinkPreviewOptions({
        is_disabled: true,
        url: "https://example.com",
        prefer_small_media: true,
        show_above_text: false,
      }),
    ).toEqual({
      is_disabled: true,
      url: "https://example.com",
      prefer_small_media: true,
      show_above_text: false,
    });
  });

  it("returns nothing when absent", () => {
    expect(readLinkPreviewOptions(undefined)).toBeUndefined();
  });

  it.each([
    "yes",
    { is_disabled: "true" },
    { url: 5 },
    { prefer_small_media: 1 },
  ])("rejects %j", (value) => {
    expect(rejection(() => readLinkPreviewOptions(value)).errorCode).toBe(400);
  });
});
