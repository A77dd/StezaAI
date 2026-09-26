import { describe, expect, it } from "vitest";
import { MAX_CALLBACK_DATA_BYTES } from "../callbacks";
import { MessageTooLongError } from "./errors";
import { asHtml } from "./htmlType";
import {
  CALLBACK_DATA_LIMIT_BYTES,
  CAPTION_LIMIT,
  RICH_LIMIT,
  utf8Length,
  TEXT_LIMIT,
  assertWithinLimit,
  visibleLength,
} from "./limits";

const html = asHtml;

describe("limits", () => {
  it("match the Bot API documentation", () => {
    expect(TEXT_LIMIT).toBe(4096);
    expect(CAPTION_LIMIT).toBe(1024);
    expect(RICH_LIMIT).toBe(32768);
    expect(CALLBACK_DATA_LIMIT_BYTES).toBe(64);
  });

  it("share the callback byte limit with the codec", () => {
    expect(CALLBACK_DATA_LIMIT_BYTES).toBe(MAX_CALLBACK_DATA_BYTES);
  });
});

describe("visibleLength", () => {
  it("counts plain text", () => {
    expect(visibleLength(html("hello"))).toBe(5);
    expect(visibleLength(html(""))).toBe(0);
  });

  it("ignores tags and their attributes", () => {
    expect(visibleLength(html('<b>ab</b><a href="https://example.com/long/path">c</a>'))).toBe(3);
  });

  it("counts a decoded entity as the one character it displays", () => {
    expect(visibleLength(html("a&amp;b&lt;c&gt;d&quot;e"))).toBe(9);
    expect(visibleLength(html("&#65;&#x42;"))).toBe(2);
  });

  it("counts UTF-16 code units, the unit Telegram uses for entity offsets", () => {
    expect(visibleLength(html("😀"))).toBe(2);
    expect(visibleLength(html("&#x1F600;"))).toBe(2);
    expect(visibleLength(html("👩‍💻"))).toBe(5);
    expect(visibleLength(html("Привет"))).toBe(6);
  });

  it("counts the fallback text of a tg-time tag", () => {
    expect(visibleLength(html('<tg-time unix="1" format="t">пт 15:00</tg-time>'))).toBe(8);
  });

  it("counts line breaks", () => {
    expect(visibleLength(html("a\n\nb"))).toBe(4);
  });
});

describe("assertWithinLimit", () => {
  it("returns the fragment when it fits exactly", () => {
    const fragment = html(`<b>${"x".repeat(10)}</b>`);

    expect(assertWithinLimit(fragment, 10)).toBe(fragment);
  });

  it("measures visible text, not markup", () => {
    const fragment = html(`<b>${"x".repeat(4096)}</b>`);

    expect(assertWithinLimit(fragment, TEXT_LIMIT)).toBe(fragment);
  });

  it("throws MessageTooLongError one character over the limit", () => {
    const fragment = html("x".repeat(11));

    expect(() => assertWithinLimit(fragment, 10)).toThrow(MessageTooLongError);
    expect(() => assertWithinLimit(fragment, 10)).toThrow(
      expect.objectContaining({ code: "render_too_long", limit: 10, actual: 11 }),
    );
  });

  it("counts entity-expanded characters against the limit", () => {
    // 6 visible characters even though the source is 30 characters long.
    const fragment = html("&amp;&amp;&amp;&amp;&amp;&amp;");

    expect(() => assertWithinLimit(fragment, 5)).toThrow(MessageTooLongError);
    expect(assertWithinLimit(fragment, 6)).toBe(fragment);
  });
});

describe("utf8Length", () => {
  it("counts encoded bytes", () => {
    expect(utf8Length("abc")).toBe(3);
    expect(utf8Length("яя")).toBe(4);
    expect(utf8Length("漢")).toBe(3);
    expect(utf8Length("😀")).toBe(4);
    expect(utf8Length("")).toBe(0);
  });
});
