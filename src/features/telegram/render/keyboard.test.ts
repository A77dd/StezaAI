import { describe, expect, it } from "vitest";
import { actionButton, disabledButton, urlButton } from "./buttons";
import { RenderError } from "./errors";
import { assertValidKeyboard, keyboard, row } from "./keyboard";
import type { ButtonSpec } from "./buttonSpec";

const noop = (text = "ok"): ButtonSpec => actionButton(text, "noop", {});
const buttons = (count: number): ButtonSpec[] =>
  Array.from({ length: count }, (_unused, index) => noop(`b${index}`));

describe("row", () => {
  it("returns its buttons in order", () => {
    const first = noop("one");
    const second = disabledButton("two");

    expect(row(first, second)).toEqual([first, second]);
  });

  it("allows 8 buttons and rejects 9", () => {
    expect(row(...buttons(8))).toHaveLength(8);
    expect(() => row(...buttons(9))).toThrow(RenderError);
  });

  it("rejects an empty row", () => {
    expect(() => row()).toThrow(RenderError);
  });
});

describe("keyboard", () => {
  it("returns rows in order", () => {
    const rows = [row(noop("a")), row(noop("b"), noop("c"))];

    expect(keyboard(...rows)).toEqual(rows);
  });

  it("allows 100 buttons and rejects 101", () => {
    const fullRows = Array.from({ length: 12 }, () => row(...buttons(8)));
    const lastRow = row(...buttons(4));

    expect(keyboard(...fullRows, lastRow).flat()).toHaveLength(100);
    expect(() => keyboard(...fullRows, row(...buttons(5)))).toThrow(RenderError);
  });

  it("rejects a keyboard without rows", () => {
    expect(() => keyboard()).toThrow(RenderError);
  });

  it("does not require unique actions or payloads", () => {
    expect(() => keyboard(row(noop("a"), noop("a")), row(noop("a")))).not.toThrow();
  });

  it("re-checks rows that were built by hand", () => {
    expect(() => keyboard([])).toThrow(RenderError);
    expect(() => keyboard(buttons(9))).toThrow(RenderError);
  });

  it("re-checks buttons that were built by hand", () => {
    const forged = { kind: "url", text: "x", url: "http://example.com" } satisfies ButtonSpec;

    expect(() => keyboard(row(forged))).toThrow(RenderError);
    expect(() => keyboard([{ kind: "disabled", text: "" }])).toThrow(RenderError);
  });

  it("mixes every button kind", () => {
    expect(() =>
      keyboard(
        row(noop("a"), urlButton("b", "https://example.com/")),
        row(disabledButton("c")),
      ),
    ).not.toThrow();
  });
});

describe("assertValidKeyboard", () => {
  it("accepts what keyboard() builds and rejects hand-built violations", () => {
    expect(() => assertValidKeyboard(keyboard(row(noop())))).not.toThrow();
    expect(() => assertValidKeyboard([])).toThrow(RenderError);
    expect(() => assertValidKeyboard([[]])).toThrow(RenderError);
  });
});
