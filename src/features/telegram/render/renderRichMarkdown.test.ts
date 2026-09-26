import { describe, expect, it } from "vitest";
import { actionButton } from "./buttons";
import { MessageTooLongError, RenderError } from "./errors";
import { keyboard, row } from "./keyboard";
import { RICH_LIMIT } from "./limits";
import { renderRichMarkdown } from "./renderRichMarkdown";

describe("renderRichMarkdown", () => {
  it("returns a rich message with no keyboard by default", () => {
    expect(renderRichMarkdown("# План\n\n- [ ] пункт")).toEqual({
      kind: "rich",
      markdown: "# План\n\n- [ ] пункт",
      keyboard: null,
    });
  });

  it("passes a valid keyboard through", () => {
    const rows = keyboard(row(actionButton("Ок", "noop", {})));

    expect(renderRichMarkdown("x", rows).keyboard).toBe(rows);
  });

  it("re-validates a keyboard assembled by hand", () => {
    expect(() => renderRichMarkdown("x", [])).toThrow(RenderError);
  });

  it("accepts exactly 32768 bytes and rejects one more", () => {
    expect(renderRichMarkdown("x".repeat(RICH_LIMIT)).markdown).toHaveLength(RICH_LIMIT);
    expect(() => renderRichMarkdown("x".repeat(RICH_LIMIT + 1))).toThrow(
      expect.objectContaining({ code: "render_too_long", limit: RICH_LIMIT, actual: RICH_LIMIT + 1 }),
    );
    expect(() => renderRichMarkdown("x".repeat(RICH_LIMIT + 1))).toThrow(MessageTooLongError);
  });

  it("counts UTF-8 bytes, never fewer than Telegram's characters", () => {
    // 3 bytes per CJK character, 4 per emoji, 2 per Cyrillic letter.
    expect(() => renderRichMarkdown("漢".repeat(10923))).toThrow(
      expect.objectContaining({ code: "render_too_long", limit: RICH_LIMIT, actual: 32769 }),
    );
    expect(renderRichMarkdown("漢".repeat(10922)).markdown).toHaveLength(10922);
    expect(() => renderRichMarkdown("😀".repeat(8193))).toThrow(MessageTooLongError);
    expect(renderRichMarkdown("😀".repeat(8192)).markdown).toHaveLength(16384);
    expect(() => renderRichMarkdown("я".repeat(16385))).toThrow(MessageTooLongError);
  });

  it("rejects an empty or blank message", () => {
    expect(() => renderRichMarkdown("")).toThrow(RenderError);
    expect(() => renderRichMarkdown(" \n ")).toThrow(RenderError);
  });

  it("applies the wire-safety policy: NUL removed, lone surrogates replaced", () => {
    expect(renderRichMarkdown("a\u0000b\ud83d").markdown).toBe("ab�");
  });
});
