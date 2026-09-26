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

  it("accepts exactly 32768 characters and rejects one more", () => {
    expect(renderRichMarkdown("x".repeat(RICH_LIMIT)).markdown).toHaveLength(RICH_LIMIT);
    expect(() => renderRichMarkdown("x".repeat(RICH_LIMIT + 1))).toThrow(
      expect.objectContaining({ code: "render_too_long", limit: RICH_LIMIT, actual: RICH_LIMIT + 1 }),
    );
    expect(() => renderRichMarkdown("x".repeat(RICH_LIMIT + 1))).toThrow(MessageTooLongError);
  });

  it("rejects an empty or blank message", () => {
    expect(() => renderRichMarkdown("")).toThrow(RenderError);
    expect(() => renderRichMarkdown(" \n ")).toThrow(RenderError);
  });

  it("applies the wire-safety policy: NUL removed, lone surrogates replaced", () => {
    expect(renderRichMarkdown("a\u0000b\ud83d").markdown).toBe("ab�");
  });
});
