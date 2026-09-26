import { describe, expect, it } from "vitest";
import { escapeHtml, escapeHtmlAttribute, sanitizeText } from "./escape";

describe("escapeHtml", () => {
  it("escapes the three characters Telegram HTML treats as markup", () => {
    expect(escapeHtml("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });

  it("leaves double quotes alone in text nodes", () => {
    expect(escapeHtml('say "hi"')).toBe('say "hi"');
  });

  it("escapes an already escaped string again instead of decoding it", () => {
    expect(escapeHtml("&lt;b&gt; &amp; &quot;")).toBe(
      "&amp;lt;b&amp;gt; &amp;amp; &amp;quot;",
    );
  });

  it("escapes ampersand first so produced entities are not double-escaped", () => {
    expect(escapeHtml("<&>")).toBe("&lt;&amp;&gt;");
  });

  it("leaves emoji and Cyrillic untouched", () => {
    const text = "Привет, мир 👩‍💻 🚀 ёЁ";

    expect(escapeHtml(text)).toBe(text);
  });

  it("returns an empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("removes NUL characters", () => {
    expect(escapeHtml("a\u0000b<\u0000")).toBe("ab&lt;");
  });

  it("replaces lone surrogates with U+FFFD and keeps valid pairs", () => {
    expect(escapeHtml("a\ud83db")).toBe("a�b");
    expect(escapeHtml("a\ude00b")).toBe("a�b");
    expect(escapeHtml("😀")).toBe("😀");
    expect(escapeHtml("\ud83d😀\ude00")).toBe("�😀�");
    expect(escapeHtml("x\ud83d")).toBe("x�");
  });
});

describe("escapeHtmlAttribute", () => {
  it("also escapes double quotes so a value cannot close the attribute", () => {
    expect(escapeHtmlAttribute('x" onclick="y')).toBe("x&quot; onclick=&quot;y");
  });

  it("escapes the same characters as escapeHtml", () => {
    expect(escapeHtmlAttribute("a&b<c>d")).toBe("a&amp;b&lt;c&gt;d");
  });

  it("applies the same sanitizing", () => {
    expect(escapeHtmlAttribute("a\u0000\ud83d")).toBe("a�");
  });
});

describe("sanitizeText", () => {
  it("is the identity for clean text", () => {
    expect(sanitizeText("Привет 👋")).toBe("Привет 👋");
  });

  it("strips NUL and replaces lone surrogates", () => {
    expect(sanitizeText("\u0000a\ud800")).toBe("a�");
  });
});
