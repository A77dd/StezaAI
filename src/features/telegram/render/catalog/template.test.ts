import { describe, expect, it } from "vitest";
import { RenderError } from "../errors";
import { b, text } from "../html";
import { fill, fillPlain, placeholders } from "./template";

describe("placeholders", () => {
  it("lists placeholder names in order of appearance, once each", () => {
    expect(placeholders("Привет, {name}! {name}, у тебя {count} задач")).toEqual(["name", "count"]);
    expect(placeholders("Без параметров")).toEqual([]);
  });
});

describe("fill", () => {
  it("escapes the template and inserts prepared markup as is", () => {
    expect(fill("Срок < {when} & «{title}»", { when: b(text("завтра")), title: text("A&B") })).toBe(
      "Срок &lt; <b>завтра</b> &amp; «A&amp;B»",
    );
  });

  it("never re-interprets the inserted value as a template", () => {
    expect(fill("{a} и {b}", { a: text("{b}"), b: text("x") })).toBe("{b} и x");
  });

  it("fails on a placeholder without a value", () => {
    expect(() => fill("Привет, {name}", {})).toThrow(RenderError);
  });

  it("fails on a value the template does not use", () => {
    expect(() => fill("Привет", { name: text("Аня") })).toThrow(RenderError);
  });

  it("does not echo the values in the error", () => {
    expect(() => fill("Привет", { secret: text("hunter2") })).toThrow(/secret|unused/);
    try {
      fill("Привет", { secret: text("hunter2") });
    } catch (error) {
      expect(String(error)).not.toContain("hunter2");
    }
  });
});

describe("fillPlain", () => {
  it("inserts plain strings without escaping (button labels are not HTML)", () => {
    expect(fillPlain("Добавить {when}", { when: "ср 16:30" })).toBe("Добавить ср 16:30");
    expect(fillPlain("{a}", { a: "<b>" })).toBe("<b>");
  });

  it("is strict like fill", () => {
    expect(() => fillPlain("{a}", {})).toThrow(RenderError);
    expect(() => fillPlain("x", { a: "1" })).toThrow(RenderError);
  });
});
