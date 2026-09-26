import { describe, expect, it } from "vitest";
import { RenderError } from "./errors";
import { escapeMarkdown, timeLink } from "./markdown";

describe("escapeMarkdown", () => {
  it("backslash-escapes every character that can start Markdown or Rich Markdown syntax", () => {
    expect(escapeMarkdown("a*b_c`d[e]f(g)h<i>j|k~l$m=n&o!p#q\\r")).toBe(
      "a\\*b\\_c\\`d\\[e\\]f\\(g\\)h\\<i\\>j\\|k\\~l\\$m\\=n\\&o\\!p\\#q\\\\r",
    );
  });

  it("leaves ordinary text, punctuation and emoji alone", () => {
    expect(escapeMarkdown("Подготовить презентацию, 16:00 — до пятницы. 😀")).toBe(
      "Подготовить презентацию, 16:00 — до пятницы. 😀",
    );
  });

  it("defuses link, image, heading and HTML injection", () => {
    const escaped = escapeMarkdown("![x](tg://user?id=1) <details></details> # h");

    expect(escaped).toBe("\\!\\[x\\]\\(tg://user?id\\=1\\) \\<details\\>\\</details\\> \\# h");
    expect(escaped).not.toMatch(/(?<!\\)[[\]<>!#]/);
  });

  it("removes NUL and unpaired surrogates like the HTML escaper", () => {
    expect(escapeMarkdown("a\u0000b\ud800c")).toBe("ab�c");
  });
});

describe("timeLink", () => {
  it("writes a date-time link whose alt text is the fallback for old clients", () => {
    expect(timeLink(1790168400, "t", "16:00")).toBe("![16:00](tg://time?unix=1790168400&format=t)");
  });

  it("escapes the fallback text", () => {
    expect(timeLink(1, "wDt", "a]b")).toBe("![a\\]b](tg://time?unix=1&format=wDt)");
  });

  it("validates the moment and the format", () => {
    expect(() => timeLink(-1, "t", "x")).toThrow(RenderError);
    expect(() => timeLink(1.5, "t", "x")).toThrow(RenderError);
    expect(() => timeLink(1, "tt&x", "x")).toThrow(RenderError);
  });
});
