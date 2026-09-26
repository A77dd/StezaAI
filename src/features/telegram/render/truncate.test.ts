import { describe, expect, it } from "vitest";
import { RenderError } from "./errors";
import { LINE_BREAK, b, i, join, link, pre, quote, text, timeTag } from "./html";
import { asHtml } from "./htmlType";
import type { Html } from "./htmlType";
import { tokenizeHtml } from "./htmlTokens";
import { visibleLength } from "./limits";
import { truncateHtml } from "./truncate";

function isBalanced(html: Html): boolean {
  const stack: string[] = [];
  for (const token of tokenizeHtml(html)) {
    if (token.kind === "open") stack.push(token.name);
    if (token.kind === "close" && stack.pop() !== token.name) return false;
  }
  return stack.length === 0;
}

describe("truncateHtml", () => {
  it("returns a fragment that already fits unchanged", () => {
    const fragment = b(text("abcde"));

    expect(truncateHtml(fragment, 5)).toBe(fragment);
  });

  it("cuts plain text and puts the ellipsis inside the limit", () => {
    const result = truncateHtml(text("abcdefghij"), 6);

    expect(result).toBe("abcde…");
    expect(visibleLength(result)).toBe(6);
  });

  it("uses the ellipsis it is given", () => {
    expect(truncateHtml(text("abcdefghij"), 6, "...")).toBe("abc...");
    expect(truncateHtml(text("abcdefghij"), 6, "")).toBe("abcdef");
  });

  it("escapes the ellipsis", () => {
    expect(truncateHtml(text("abcdefghij"), 6, "<>")).toBe("abcd&lt;&gt;");
  });

  it("closes every open tag, innermost first", () => {
    const fragment = b(join([text("abc"), i(text("defgh"))]));

    expect(truncateHtml(fragment, 6)).toBe("<b>abc<i>de…</i></b>");
  });

  it("keeps the tags that were closed before the cut", () => {
    const fragment = join([b(text("ab")), text("cdefghij")]);

    expect(truncateHtml(fragment, 6)).toBe("<b>ab</b>cde…");
  });

  it("never cuts inside an entity", () => {
    // Visible: a&b&c&d (7 characters); "&amp;" must stay whole or go entirely.
    const fragment = text("a&b&c&d");

    expect(truncateHtml(fragment, 4)).toBe("a&amp;b…");
    expect(truncateHtml(fragment, 3)).toBe("a&amp;…");
    expect(truncateHtml(fragment, 2)).toBe("a…");
  });

  it("drops a multi-unit entity that does not fit instead of splitting it", () => {
    expect(truncateHtml(asHtml("a&#x1F600;bcdef"), 3)).toBe("a…");
  });

  it("never splits a surrogate pair", () => {
    expect(truncateHtml(text("ab😀cdef"), 4)).toBe("ab…");
    expect(truncateHtml(text("ab😀cdef"), 5)).toBe("ab😀…");
  });

  it("truncates inside a blockquote and keeps it closed", () => {
    const fragment = quote(join([text("line one"), LINE_BREAK, text("line two is long")]), {
      expandable: true,
    });

    expect(truncateHtml(fragment, 14)).toBe(
      "<blockquote expandable>line one\nline…</blockquote>",
    );
  });

  it("truncates code blocks and closes the nested code tag", () => {
    expect(truncateHtml(pre("abcdefgh", "js"), 4)).toBe(
      '<pre><code class="language-js">abc…</code></pre>',
    );
  });

  it("keeps link attributes intact", () => {
    const fragment = link(text("abcdefgh"), "https://example.com/?a=1&b=2");

    expect(truncateHtml(fragment, 4)).toBe(
      '<a href="https://example.com/?a=1&amp;b=2">abc…</a>',
    );
  });

  it("drops a tag that has no visible content left", () => {
    const fragment = join([b(text("abc")), i(text("defgh"))]);

    expect(truncateHtml(fragment, 4)).toBe("<b>abc…</b>");
    expect(truncateHtml(fragment, 3)).toBe("<b>ab…</b>");
    expect(truncateHtml(join([text("abc"), i(text("defgh"))]), 4)).toBe("abc…");
  });

  it("drops a tag that the cut left empty", () => {
    const fragment = join([text("a"), b(asHtml("&#x1F600;xyz"))]);

    expect(truncateHtml(fragment, 3)).toBe("a…");
  });

  it("never cuts the fallback of a tg-time tag; it goes whole or not at all", () => {
    const fragment = join([text("at "), timeTag(1, "t", "15:00 fallback")]);

    expect(truncateHtml(fragment, 8)).toBe("at …");
    expect(truncateHtml(fragment, 40)).toBe(fragment);
  });

  it("rejects a limit smaller than the ellipsis", () => {
    expect(() => truncateHtml(text("abcdef"), 2, "...")).toThrow(RenderError);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects the limit %s", (limit) => {
    expect(() => truncateHtml(text("abc"), limit)).toThrow(RenderError);
  });

  it("rejects mismatched tags instead of guessing", () => {
    expect(() => truncateHtml(asHtml("<b>ab</i>cdefgh"), 5)).toThrow(RenderError);
    expect(() => truncateHtml(asHtml("ab</b>cdefgh"), 5)).toThrow(RenderError);
  });

  it("always yields balanced markup within the limit, whatever the cut point", () => {
    const fragment = join([
      b(text("Заголовок & 😀 ")),
      link(i(text("ссылка <тут>")), "https://example.com/?a=1&b=2"),
      LINE_BREAK,
      quote(join([text("цитата 😀😀 "), b(text("жирный")), pre("код & <x>", "ts")]), {
        expandable: true,
      }),
      timeTag(1_790_000_000, "wDt", "пт, 15:00"),
      text(" хвост &amp; конец"),
    ]);
    const total = visibleLength(fragment);

    for (let limit = 1; limit < total; limit += 1) {
      const result = truncateHtml(fragment, limit);

      expect(visibleLength(result)).toBeLessThanOrEqual(limit);
      expect(isBalanced(result)).toBe(true);
      expect(result.endsWith("…") || result.includes("…</")).toBe(true);
    }
  });
});
