import { describe, expect, expectTypeOf, it } from "vitest";
import { RenderError } from "./errors";
import {
  BLANK_LINE,
  LINE_BREAK,
  b,
  code,
  i,
  join,
  lines,
  link,
  pre,
  quote,
  s,
  spoiler,
  text,
  timeTag,
  u,
} from "./html";
import type { Html } from "./htmlType";

describe("text", () => {
  it("escapes user text", () => {
    expect(text("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });

  it("returns an empty fragment for an empty string", () => {
    expect(text("")).toBe("");
  });
});

describe("inline formatting", () => {
  it.each([
    ["b", b, "b"],
    ["i", i, "i"],
    ["u", u, "u"],
    ["s", s, "s"],
    ["spoiler", spoiler, "tg-spoiler"],
  ] as const)("%s wraps a fragment in <%s>", (_name, build, tag) => {
    expect(build(text("x & y"))).toBe(`<${tag}>x &amp; y</${tag}>`);
  });

  it("nests formatting inside formatting", () => {
    expect(b(i(u(text("x"))))).toBe("<b><i><u>x</u></i></b>");
  });

  it.each([
    ["code", code("x")],
    ["pre", pre("x")],
  ])("refuses to contain %s (Bot API nesting rule)", (_name, inner) => {
    for (const build of [b, i, u, s, spoiler]) {
      expect(() => build(inner)).toThrow(RenderError);
    }
  });

  it("refuses to contain a blockquote", () => {
    for (const build of [b, i, u, s, spoiler]) {
      expect(() => build(quote(text("x")))).toThrow(RenderError);
    }
  });
});

describe("code and pre", () => {
  it("escape their content and take plain text, so nothing can nest inside", () => {
    expect(code("<b>x</b> & y")).toBe("<code>&lt;b&gt;x&lt;/b&gt; &amp; y</code>");
    expect(pre("a\n<b>")).toBe("<pre>a\n&lt;b&gt;</pre>");
    expectTypeOf(code).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(pre).parameter(0).toEqualTypeOf<string>();
  });

  it("marks the language on a code block", () => {
    expect(pre("print(1)", "python")).toBe(
      '<pre><code class="language-python">print(1)</code></pre>',
    );
    expect(pre("x", "c++")).toBe('<pre><code class="language-c++">x</code></pre>');
  });

  it.each(["", 'a"b', "py thon", "a".repeat(33), "<b>"])(
    "rejects the language %j",
    (language) => {
      expect(() => pre("x", language)).toThrow(RenderError);
    },
  );
});

describe("link", () => {
  it.each([
    ["https://example.com/a", "https://example.com/a"],
    ["http://example.com/a", "http://example.com/a"],
    ["tg://user?id=123456789", "tg://user?id=123456789"],
  ])("accepts %s", (url, href) => {
    expect(link(text("go"), url)).toBe(`<a href="${href}">go</a>`);
  });

  it("escapes the address so a query string cannot break out of the attribute", () => {
    expect(link(text("go"), "https://example.com/?a=1&b=2")).toBe(
      '<a href="https://example.com/?a=1&amp;b=2">go</a>',
    );
    expect(link(text("go"), 'https://example.com/?q="x"')).toBe(
      '<a href="https://example.com/?q=%22x%22">go</a>',
    );
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "ftp://example.com",
    "file:///etc/passwd",
    "mailto:a@example.com",
    "//example.com",
    "example.com",
    "not a url",
    "",
  ])("rejects the address %j", (url) => {
    expect(() => link(text("go"), url)).toThrow(RenderError);
  });

  it("does not echo the rejected address in the error", () => {
    expect(() => link(text("go"), "javascript:secret()")).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("secret") }),
    );
  });

  it("accepts formatting in the label", () => {
    expect(link(b(text("go")), "https://example.com/")).toBe(
      '<a href="https://example.com/"><b>go</b></a>',
    );
  });

  it("refuses a label with a link, time, code, pre or blockquote inside", () => {
    const inner = [
      link(text("x"), "https://example.com/"),
      timeTag(1, "t", "x"),
      code("x"),
      pre("x"),
      quote(text("x")),
    ];
    for (const fragment of inner) {
      expect(() => link(fragment, "https://example.com/")).toThrow(RenderError);
    }
  });
});

describe("quote", () => {
  it("builds a plain and an expandable blockquote", () => {
    expect(quote(text("x"))).toBe("<blockquote>x</blockquote>");
    expect(quote(text("x"), { expandable: false })).toBe("<blockquote>x</blockquote>");
    expect(quote(text("x"), { expandable: true })).toBe(
      "<blockquote expandable>x</blockquote>",
    );
  });

  it("may contain formatting, links, code and pre", () => {
    const inner = lines(b(text("t")), pre("a"), code("b"), link(text("l"), "https://example.com/"));

    expect(quote(inner)).toBe(
      '<blockquote><b>t</b>\n<pre>a</pre>\n<code>b</code>\n<a href="https://example.com/">l</a></blockquote>',
    );
  });

  it("cannot be nested in another blockquote", () => {
    expect(() => quote(quote(text("x")))).toThrow(RenderError);
    expect(() => quote(join([text("a"), quote(text("x"))]), { expandable: true })).toThrow(
      RenderError,
    );
  });
});

describe("timeTag", () => {
  it("builds a tg-time entity with the fallback as its body", () => {
    expect(timeTag(1_790_000_000, "wDt", "пт, 15:00")).toBe(
      '<tg-time unix="1790000000" format="wDt">пт, 15:00</tg-time>',
    );
  });

  it("escapes the fallback text", () => {
    expect(timeTag(1, "t", "<&>")).toBe('<tg-time unix="1" format="t">&lt;&amp;&gt;</tg-time>');
  });

  it("omits the format attribute for an empty format (text shown as is)", () => {
    expect(timeTag(1, "", "x")).toBe('<tg-time unix="1">x</tg-time>');
  });

  it.each(["r", "w", "d", "D", "t", "T", "wd", "wD", "wt", "dt", "DT", "wdt", "wDT"])(
    "accepts the format %s",
    (format) => {
      expect(timeTag(1, format, "x")).toContain(`format="${format}"`);
    },
  );

  it.each(["rt", "rw", "tw", "td", "dD", "tT", "x", "w d", "wdtt", "R", "r "])(
    "rejects the format %j",
    (format) => {
      expect(() => timeTag(1, format, "x")).toThrow(RenderError);
    },
  );

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects the unix time %s",
    (unix) => {
      expect(() => timeTag(unix, "t", "x")).toThrow(RenderError);
    },
  );

  it("can sit inside formatting", () => {
    expect(b(timeTag(1, "t", "x"))).toBe('<b><tg-time unix="1" format="t">x</tg-time></b>');
  });
});

describe("join and lines", () => {
  it("joins fragments with a separator", () => {
    expect(join([text("a"), text("b"), text("c")], text(", "))).toBe("a, b, c");
  });

  it("joins with nothing by default and handles no parts", () => {
    expect(join([text("a"), b(text("b"))])).toBe("a<b>b</b>");
    expect(join([])).toBe("");
  });

  it("lines joins with a single line break", () => {
    expect(lines(text("a"), text("b"))).toBe("a\nb");
    expect(LINE_BREAK).toBe("\n");
    expect(BLANK_LINE).toBe("\n\n");
  });
});

describe("Html brand", () => {
  it("is the only thing the builders accept", () => {
    expectTypeOf(text("x")).toEqualTypeOf<Html>();
    expectTypeOf(b).parameter(0).toEqualTypeOf<Html>();
    expectTypeOf(link).parameter(0).toEqualTypeOf<Html>();
    expectTypeOf(quote).parameter(0).toEqualTypeOf<Html>();
    expectTypeOf(join).parameter(0).toEqualTypeOf<readonly Html[]>();
    expectTypeOf(b(text("x"))).toEqualTypeOf<Html>();
  });

  it("rejects a plain string at compile time", () => {
    expectTypeOf<string>().not.toExtend<Html>();
    const neverCalled = () => {
      // @ts-expect-error a plain string is not escaped markup
      b("<script>");
      // @ts-expect-error a plain string is not escaped markup
      join(["a"]);
    };
    expect(neverCalled).toBeTypeOf("function");
  });
});
