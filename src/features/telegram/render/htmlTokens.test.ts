import { describe, expect, it } from "vitest";
import { RenderError } from "./errors";
import { asHtml } from "./htmlType";
import { openTagNames, tokenizeHtml } from "./htmlTokens";

const html = asHtml;

describe("tokenizeHtml", () => {
  it("splits text, tags and entities", () => {
    expect(tokenizeHtml(html("a <b>x &amp; y</b>"))).toEqual([
      { kind: "text", source: "a ", text: "a " },
      { kind: "open", name: "b", source: "<b>" },
      { kind: "text", source: "x ", text: "x " },
      { kind: "text", source: "&amp;", text: "&" },
      { kind: "text", source: " y", text: " y" },
      { kind: "close", name: "b", source: "</b>" },
    ]);
  });

  it("keeps attributes in the opening tag source and reads tag names in lower case", () => {
    const [open] = tokenizeHtml(html('<tg-time unix="1" format="t">x</tg-time>'));

    expect(open).toEqual({
      kind: "open",
      name: "tg-time",
      source: '<tg-time unix="1" format="t">',
    });
  });

  it("does not treat > or & inside an escaped attribute as markup", () => {
    const tokens = tokenizeHtml(html('<a href="https://x.test/?a=1&amp;b=2&gt;">x</a>'));

    expect(tokens.map((token) => token.kind)).toEqual(["open", "text", "close"]);
  });

  it.each([
    ["&amp;", "&"],
    ["&lt;", "<"],
    ["&gt;", ">"],
    ["&quot;", '"'],
    ["&#65;", "A"],
    ["&#x41;", "A"],
    ["&#X1F600;", "😀"],
    ["&#128512;", "😀"],
  ])("decodes %s", (source, decoded) => {
    expect(tokenizeHtml(html(source))).toEqual([
      { kind: "text", source, text: decoded },
    ]);
  });

  it.each(["&#0;", "&#xD800;", "&#x110000;", "&#99999999999;"])(
    "rejects the invalid numeric entity %s",
    (source) => {
      expect(() => tokenizeHtml(html(source))).toThrow(RenderError);
    },
  );

  it.each([
    ["an unescaped ampersand", "a & b"],
    ["an unknown named entity", "&nbsp;"],
    ["a stray angle bracket", "a < b"],
    ["an unterminated tag", "<b"],
    ["an uppercase tag", "<B>x</B>"],
  ])("rejects %s", (_label, source) => {
    expect(() => tokenizeHtml(html(source))).toThrow(RenderError);
  });

  it("returns no tokens for an empty fragment", () => {
    expect(tokenizeHtml(html(""))).toEqual([]);
  });
});

describe("openTagNames", () => {
  it("lists every distinct element used in a fragment", () => {
    const names = openTagNames(html("<b>a</b> <i>b <code>c</code></i> <b>d</b> &lt;u&gt;"));

    expect([...names].sort()).toEqual(["b", "code", "i"]);
  });
});
