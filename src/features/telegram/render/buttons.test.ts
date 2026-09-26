import { describe, expect, expectTypeOf, it } from "vitest";
import { RenderError } from "./errors";
import {
  actionButton,
  copyButton,
  disabledButton,
  switchInlineButton,
  urlButton,
  webAppButton,
} from "./buttons";
import type { ButtonSpec } from "./buttonSpec";

describe("actionButton", () => {
  it("describes an action and its payload, not a callback string", () => {
    expect(actionButton("Поставить", "slot.pick", { taskId: "t1", slotIndex: 0 })).toEqual({
      kind: "action",
      text: "Поставить",
      action: "slot.pick",
      payload: { taskId: "t1", slotIndex: 0 },
    });
  });

  it("carries an optional style", () => {
    const button = actionButton("Отмена", "slot.other", { taskId: "t1" }, "danger");

    expect(button).toMatchObject({ style: "danger" });
  });

  it("omits the style key when there is no style", () => {
    expect("style" in actionButton("Ок", "noop", {})).toBe(false);
  });

  it("ties the payload type to the action at compile time", () => {
    expectTypeOf(actionButton("x", "slot.other", { taskId: "t" })).toEqualTypeOf<ButtonSpec>();
    const neverCalled = () => {
      // @ts-expect-error slot.pick needs a slotIndex
      actionButton("x", "slot.pick", { taskId: "t" });
      // @ts-expect-error unknown action
      actionButton("x", "no.such.action", {});
    };
    expect(neverCalled).toBeTypeOf("function");
  });
});

describe("button text", () => {
  it("accepts 1 to 64 characters", () => {
    expect(() => actionButton("a", "noop", {})).not.toThrow();
    expect(() => actionButton("я".repeat(64), "noop", {})).not.toThrow();
  });

  it("rejects an empty, blank or too long label", () => {
    expect(() => actionButton("", "noop", {})).toThrow(RenderError);
    expect(() => actionButton("   ", "noop", {})).toThrow(RenderError);
    expect(() => actionButton("я".repeat(65), "noop", {})).toThrow(RenderError);
  });

  it("counts an emoji as one visible character, not two UTF-16 units", () => {
    expect(() => actionButton("😀".repeat(64), "noop", {})).not.toThrow();
    expect(() => actionButton("😀".repeat(65), "noop", {})).toThrow(RenderError);
  });

  it("rejects NUL and lone surrogates", () => {
    expect(() => actionButton("a\u0000b", "noop", {})).toThrow(RenderError);
    expect(() => actionButton("a\ud83d", "noop", {})).toThrow(RenderError);
  });

  it("is not HTML-escaped: reply_markup is JSON", () => {
    expect(actionButton("A & B <C>", "noop", {})).toMatchObject({ text: "A & B <C>" });
  });
});

describe("urlButton and webAppButton", () => {
  it("accept https addresses", () => {
    expect(urlButton("Открыть", "https://example.com/a?b=1")).toEqual({
      kind: "url",
      text: "Открыть",
      url: "https://example.com/a?b=1",
    });
    expect(webAppButton("Выбрать время", "https://example.com/app")).toEqual({
      kind: "web_app",
      text: "Выбрать время",
      url: "https://example.com/app",
    });
  });

  it.each(["http://example.com", "tg://user?id=1", "javascript:alert(1)", "example.com", ""])(
    "reject %j",
    (url) => {
      expect(() => urlButton("x", url)).toThrow(RenderError);
      expect(() => webAppButton("x", url)).toThrow(RenderError);
    },
  );
});

describe("copyButton", () => {
  it("copies 1 to 256 characters", () => {
    expect(copyButton("Скопировать", "пт 15:00")).toEqual({
      kind: "copy_text",
      text: "Скопировать",
      copyText: "пт 15:00",
    });
    expect(() => copyButton("x", "a".repeat(256))).not.toThrow();
  });

  it("rejects empty and over-long text", () => {
    expect(() => copyButton("x", "")).toThrow(RenderError);
    expect(() => copyButton("x", "a".repeat(257))).toThrow(RenderError);
  });

  it("counts UTF-16 units, the conservative reading of Telegram's limit", () => {
    expect(() => copyButton("x", "😀".repeat(128))).not.toThrow();
    expect(() => copyButton("x", "😀".repeat(129))).toThrow(RenderError);
  });

  it("rejects NUL", () => {
    expect(() => copyButton("x", "a\u0000")).toThrow(RenderError);
  });
});

describe("switchInlineButton", () => {
  it("names the mode and the query", () => {
    expect(switchInlineButton("Найти", "свободное время", "current_chat")).toEqual({
      kind: "switch_inline",
      text: "Найти",
      query: "свободное время",
      mode: "current_chat",
    });
  });

  it("allows an empty query (only the bot name is inserted) but not a long one", () => {
    expect(() => switchInlineButton("x", "", "any")).not.toThrow();
    expect(() => switchInlineButton("x", "a".repeat(256), "chosen_chat")).not.toThrow();
    expect(() => switchInlineButton("x", "a".repeat(257), "any")).toThrow(RenderError);
  });
});

describe("disabledButton", () => {
  it("is just a label", () => {
    expect(disabledButton("✅ Поставлено")).toEqual({ kind: "disabled", text: "✅ Поставлено" });
  });

  it("still validates the label", () => {
    expect(() => disabledButton("")).toThrow(RenderError);
  });
});
