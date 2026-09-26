import { describe, expect, it } from "vitest";
import { EntityParseError } from "./entityRules";
import { parseTelegramHtml } from "./htmlOracle";

function parse(html: string) {
  return parseTelegramHtml(html);
}

describe("parseTelegramHtml: text and entities", () => {
  it("returns plain text without entities", () => {
    expect(parse("hello world")).toEqual({ text: "hello world", entities: [] });
  });

  it("parses nested bold and italic into entities ordered by offset then length", () => {
    expect(parse("a <b>bold <i>both</i></b> c")).toEqual({
      text: "a bold both c",
      entities: [
        { type: "bold", offset: 2, length: 9 },
        { type: "italic", offset: 7, length: 4 },
      ],
    });
  });

  it.each([
    ["<b>x</b>", "bold"],
    ["<strong>x</strong>", "bold"],
    ["<i>x</i>", "italic"],
    ["<em>x</em>", "italic"],
    ["<u>x</u>", "underline"],
    ["<ins>x</ins>", "underline"],
    ["<s>x</s>", "strikethrough"],
    ["<strike>x</strike>", "strikethrough"],
    ["<del>x</del>", "strikethrough"],
    ["<tg-spoiler>x</tg-spoiler>", "spoiler"],
    ['<span class="tg-spoiler">x</span>', "spoiler"],
    ["<code>x</code>", "code"],
    ["<pre>x</pre>", "pre"],
    ["<blockquote>x</blockquote>", "blockquote"],
    ["<blockquote expandable>x</blockquote>", "expandable_blockquote"],
  ])("maps %s to a %s entity", (html, type) => {
    expect(parse(html)).toEqual({ text: "x", entities: [{ type, offset: 0, length: 1 }] });
  });

  it("decodes the four named entities and numeric entities", () => {
    expect(parse("&lt;a&gt; &amp; &quot;q&quot; &#65;&#x42; &#x1F600;").text).toBe('<a> & "q" AB 😀');
  });

  it("counts offsets and lengths in UTF-16 code units", () => {
    expect(parse("😀<b>x</b>").entities).toEqual([{ type: "bold", offset: 2, length: 1 }]);
    expect(parse("<b>😀😀</b>").entities).toEqual([{ type: "bold", offset: 0, length: 4 }]);
  });

  it("drops entities that end up empty", () => {
    expect(parse("<b></b>x")).toEqual({ text: "x", entities: [] });
  });

  it("keeps whitespace and newlines as they are", () => {
    expect(parse("a\n\n<b> b </b>").text).toBe("a\n\n b ");
  });

  it("accepts tag names in any letter case", () => {
    expect(parse("<B>x</B>").entities).toEqual([{ type: "bold", offset: 0, length: 1 }]);
  });
});

describe("parseTelegramHtml: links, emoji and dates", () => {
  it("builds a text_link from href and decodes entities in the value", () => {
    expect(parse('<a href="https://example.com/?a=1&amp;b=2">go</a>')).toEqual({
      text: "go",
      entities: [{ type: "text_link", offset: 0, length: 2, url: "https://example.com/?a=1&b=2" }],
    });
  });

  it("accepts single quoted, unquoted and tg:// hrefs", () => {
    expect(parse("<a href='https://example.com'>x</a>").entities).toHaveLength(1);
    expect(parse("<a href=https://example.com>x</a>").entities).toHaveLength(1);
    expect(parse('<a href="tg://user?id=123">x</a>').entities).toHaveLength(1);
  });

  it.each(['<a>x</a>', '<a href="">x</a>', '<a href="javascript:alert(1)">x</a>', '<a href="not a url">x</a>'])(
    "rejects a link without a usable href: %s",
    (html) => {
      expect(() => parse(html)).toThrow(/href/);
    },
  );

  it("builds a custom_emoji entity and requires a numeric id", () => {
    expect(parse('<tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>').entities).toEqual([
      { type: "custom_emoji", offset: 0, length: 2, custom_emoji_id: "5368324170671202286" },
    ]);
    expect(() => parse("<tg-emoji>👍</tg-emoji>")).toThrow(/emoji-id/);
    expect(() => parse('<tg-emoji emoji-id="abc">👍</tg-emoji>')).toThrow(/emoji-id/);
  });

  it("builds a date_time entity from unix and format", () => {
    expect(parse('<tg-time unix="1800000000" format="wDt">Fri 15:00</tg-time>').entities).toEqual([
      { type: "date_time", offset: 0, length: 9, unix_time: 1_800_000_000, date_time_format: "wDt" },
    ]);
  });

  it("treats a missing format as the empty format", () => {
    expect(parse('<tg-time unix="1800000000">x</tg-time>').entities).toEqual([
      { type: "date_time", offset: 0, length: 1, unix_time: 1_800_000_000, date_time_format: "" },
    ]);
  });

  it.each([
    '<tg-time>x</tg-time>',
    '<tg-time unix="abc">x</tg-time>',
    '<tg-time unix="-5">x</tg-time>',
    '<tg-time unix="1.5">x</tg-time>',
  ])("rejects a tg-time without a valid unix: %s", (html) => {
    expect(() => parse(html)).toThrow(/unix/);
  });

  it.each(["zz", "rw", "dD", "R"])("rejects tg-time format %j", (format) => {
    expect(() => parse(`<tg-time unix="1800000000" format="${format}">x</tg-time>`)).toThrow(/format/);
  });
});

describe("parseTelegramHtml: pre and code", () => {
  it("reads the language from a code tag directly inside pre", () => {
    expect(parse('<pre><code class="language-python">print(1)</code></pre>')).toEqual({
      text: "print(1)",
      entities: [{ type: "pre", offset: 0, length: 8, language: "python" }],
    });
  });

  it("accepts a code tag without a class inside pre", () => {
    expect(parse("<pre><code>x</code></pre>").entities).toEqual([{ type: "pre", offset: 0, length: 1 }]);
  });

  it("rejects a class on a standalone code tag and a span with another class", () => {
    expect(() => parse('<code class="language-python">x</code>')).toThrow(/class/);
    expect(() => parse('<span class="other">x</span>')).toThrow(/span/);
    expect(() => parse("<span>x</span>")).toThrow(/span/);
  });
});

describe("parseTelegramHtml: nesting rules (research 5.1)", () => {
  it("allows formatting around links and links around formatting", () => {
    expect(() => parse('<b><a href="https://example.com">x</a></b>')).not.toThrow();
    expect(() => parse('<a href="https://example.com"><b>x</b></a>')).not.toThrow();
  });

  it("allows links, code and formatting inside a blockquote", () => {
    expect(() => parse('<blockquote><b>x</b> <a href="https://example.com">y</a> <code>z</code></blockquote>')).not.toThrow();
  });

  it.each([
    ["<pre><b>x</b></pre>", /b.*nested.*pre|pre/],
    ["<code><b>x</b></code>", /nested/],
    ["<b><code>x</code></b>", /nested/],
    ["<i><pre>x</pre></i>", /nested/],
    ["<blockquote><blockquote>x</blockquote></blockquote>", /nested/],
    ["<blockquote><b><blockquote expandable>x</blockquote></b></blockquote>", /nested/],
    ['<a href="https://a.example"><a href="https://b.example">x</a></a>', /nested/],
    ['<a href="https://a.example"><b><a href="https://b.example">x</a></b></a>', /nested/],
    ['<a href="https://a.example"><tg-time unix="1">x</tg-time></a>', /nested/],
  ])("rejects %s", (html, message) => {
    expect(() => parse(html)).toThrow(message);
    expect(() => parse(html)).toThrow(EntityParseError);
  });
});

describe("parseTelegramHtml: malformed input", () => {
  it("rejects unknown tags and reports the UTF-8 byte offset", () => {
    expect(() => parse("<div>x</div>")).toThrow('Unsupported start tag "div" at byte offset 0');
    // "Привет " is 13 bytes in UTF-8 but 7 UTF-16 code units.
    expect(() => parse("Привет <marquee>x</marquee>")).toThrow(
      'Unsupported start tag "marquee" at byte offset 13',
    );
  });

  it("rejects a stray less-than sign", () => {
    expect(() => parse("1 < 2")).toThrow(/at byte offset 2/);
    expect(() => parse("a <")).toThrow(/byte offset 2/);
    expect(() => parse("<>")).toThrow(/Unsupported start tag/);
  });

  it("rejects an unescaped greater-than sign and ampersand", () => {
    expect(() => parse("1 > 0")).toThrow(/'>'.*&gt;/);
    expect(() => parse("Tom & Jerry")).toThrow(/'&'.*&amp;/);
  });

  it("rejects named entities other than lt, gt, amp and quot", () => {
    expect(() => parse("a&nbsp;b")).toThrow(/&nbsp;/);
    expect(() => parse("&apos;")).toThrow(/&apos;/);
    expect(() => parse("&hellip;")).toThrow(/&hellip;/);
  });

  it.each(["&#0;", "&#xD800;", "&#x110000;", "&#;", "&#xZZ;"])("rejects numeric entity %s", (entity) => {
    expect(() => parse(`a${entity}b`)).toThrow(EntityParseError);
  });

  it("rejects a tag that is never closed", () => {
    expect(() => parse("<b>x")).toThrow('Can\'t find end tag corresponding to start tag "b"');
    expect(() => parse("<b><i>x</i>")).toThrow('start tag "b"');
  });

  it("rejects an end tag that does not match the open tag", () => {
    expect(() => parse("<b><i>x</b></i>")).toThrow(/Unmatched end tag at byte offset 7/);
    expect(() => parse("<b>x</strong>")).toThrow(/expected "<\/b>", found "<\/strong>"/);
  });

  it("rejects an end tag with nothing open", () => {
    expect(() => parse("x</b>")).toThrow(/Unexpected end tag at byte offset 1/);
  });

  it("rejects a tag that never ends", () => {
    expect(() => parse("<b")).toThrow(/Can't find end of the entity starting at byte offset 0/);
    expect(() => parse('<a href="x>y</a>')).toThrow(/Can't find end of the entity/);
  });

  it("rejects self closing tags", () => {
    expect(() => parse("<b/>")).toThrow(/Unsupported start tag/);
  });
});
