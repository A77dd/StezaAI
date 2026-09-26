import { describe, expect, it } from "vitest";
import type { MessageEntity } from "grammy/types";
import {
  EntityParseError,
  isValidDateTimeFormat,
  mayContain,
  validateEntities,
} from "./entityRules";

const alex = { id: 1, is_bot: false, first_name: "Alex" };

describe("mayContain (research 5.1 nesting rules)", () => {
  it("lets formatting entities contain and be part of link-like entities", () => {
    expect(mayContain("bold", "italic")).toBe(true);
    expect(mayContain("bold", "text_link")).toBe(true);
    expect(mayContain("text_link", "bold")).toBe(true);
    expect(mayContain("blockquote", "bold")).toBe(true);
    expect(mayContain("bold", "blockquote")).toBe(true);
  });

  it("forbids anything but the language marker inside pre and nothing inside code", () => {
    expect(mayContain("pre", "code")).toBe(true);
    expect(mayContain("pre", "bold")).toBe(false);
    expect(mayContain("code", "bold")).toBe(false);
    expect(mayContain("code", "code")).toBe(false);
  });

  it("forbids code and pre inside formatting entities", () => {
    expect(mayContain("bold", "code")).toBe(false);
    expect(mayContain("spoiler", "pre")).toBe(false);
  });

  it("forbids nested blockquotes of either kind", () => {
    expect(mayContain("blockquote", "blockquote")).toBe(false);
    expect(mayContain("blockquote", "expandable_blockquote")).toBe(false);
    expect(mayContain("expandable_blockquote", "blockquote")).toBe(false);
  });

  it("forbids links, emoji and dates inside each other but allows quotes to hold them", () => {
    expect(mayContain("text_link", "text_link")).toBe(false);
    expect(mayContain("text_link", "date_time")).toBe(false);
    expect(mayContain("date_time", "custom_emoji")).toBe(false);
    expect(mayContain("blockquote", "text_link")).toBe(true);
    expect(mayContain("blockquote", "code")).toBe(true);
    expect(mayContain("blockquote", "pre")).toBe(true);
  });
});

describe("isValidDateTimeFormat", () => {
  it.each(["r", "", "wDt", "wdT", "t", "D", "wt", "w"])("accepts %j", (format) => {
    expect(isValidDateTimeFormat(format)).toBe(true);
  });

  it.each(["x", "rw", "rt", "dD", "tD", "Dw", "wdD", "R"])("rejects %j", (format) => {
    expect(isValidDateTimeFormat(format)).toBe(false);
  });
});

describe("validateEntities", () => {
  it("accepts an empty or missing list", () => {
    expect(validateEntities("hello", [])).toEqual([]);
  });

  it("returns the entities it accepted", () => {
    const entities: MessageEntity[] = [
      { type: "bold", offset: 0, length: 2 },
      { type: "italic", offset: 0, length: 2 },
      { type: "text_link", offset: 3, length: 2, url: "https://example.com" },
    ];

    expect(validateEntities("ab cd", entities)).toEqual(entities);
  });

  it("rejects a list that is not an array", () => {
    expect(() => validateEntities("hello", "bold")).toThrow(EntityParseError);
  });

  it("rejects an entity that is not an object or has an unknown type", () => {
    expect(() => validateEntities("hello", ["bold"])).toThrow(EntityParseError);
    expect(() => validateEntities("hello", [{ type: "marquee", offset: 0, length: 1 }])).toThrow(
      /unknown entity type/,
    );
  });

  it.each([
    { offset: -1, length: 1 },
    { offset: 0, length: 0 },
    { offset: 0.5, length: 1 },
    { offset: 0, length: 6 },
    { offset: 5, length: 1 },
    { offset: "0", length: 1 },
  ])("rejects out of range or non-integer bounds %j", (bounds) => {
    expect(() => validateEntities("hello", [{ type: "bold", ...bounds }])).toThrow(EntityParseError);
  });

  it("measures offsets in UTF-16 code units", () => {
    // "😀" is two code units, so the bold "a" sits at offset 2.
    expect(validateEntities("😀a", [{ type: "bold", offset: 2, length: 1 }])).toHaveLength(1);
    expect(() => validateEntities("😀a", [{ type: "bold", offset: 3, length: 1 }])).toThrow(
      EntityParseError,
    );
  });

  it("rejects entities that partially overlap", () => {
    expect(() =>
      validateEntities("abcdef", [
        { type: "bold", offset: 0, length: 4 },
        { type: "italic", offset: 2, length: 4 },
      ]),
    ).toThrow(/overlap/);
  });

  it("accepts entities that only touch", () => {
    expect(
      validateEntities("abcd", [
        { type: "bold", offset: 0, length: 2 },
        { type: "italic", offset: 2, length: 2 },
      ]),
    ).toHaveLength(2);
  });

  it("rejects a nested blockquote and code inside bold, whichever way the array is ordered", () => {
    expect(() =>
      validateEntities("abcd", [
        { type: "blockquote", offset: 0, length: 4 },
        { type: "expandable_blockquote", offset: 1, length: 2 },
      ]),
    ).toThrow(/nested/);
    expect(() =>
      validateEntities("abcd", [
        { type: "code", offset: 1, length: 2 },
        { type: "bold", offset: 0, length: 4 },
      ]),
    ).toThrow(/nested/);
  });

  it("accepts identical ranges when either entity may contain the other", () => {
    expect(
      validateEntities("abcd", [
        { type: "italic", offset: 0, length: 4 },
        { type: "bold", offset: 0, length: 4 },
      ]),
    ).toHaveLength(2);
    expect(() =>
      validateEntities("abcd", [
        { type: "code", offset: 0, length: 4 },
        { type: "bold", offset: 0, length: 4 },
      ]),
    ).toThrow(/nested/);
  });

  it("requires the type specific fields", () => {
    expect(() => validateEntities("abc", [{ type: "text_link", offset: 0, length: 3 }])).toThrow(
      /url/,
    );
    expect(() =>
      validateEntities("abc", [{ type: "text_link", offset: 0, length: 3, url: "javascript:alert(1)" }]),
    ).toThrow(/url/);
    expect(() => validateEntities("abc", [{ type: "text_mention", offset: 0, length: 3 }])).toThrow(
      /user/,
    );
    expect(
      validateEntities("abc", [{ type: "text_mention", offset: 0, length: 3, user: alex }]),
    ).toHaveLength(1);
    expect(() => validateEntities("abc", [{ type: "custom_emoji", offset: 0, length: 3 }])).toThrow(
      /custom_emoji_id/,
    );
    expect(() => validateEntities("abc", [{ type: "pre", offset: 0, length: 3, language: 5 }])).toThrow(
      /language/,
    );
  });

  it("validates date_time entities", () => {
    const ok = { type: "date_time", offset: 0, length: 3, unix_time: 1_800_000_000, date_time_format: "wDt" };
    expect(validateEntities("abc", [ok])).toHaveLength(1);
    expect(() => validateEntities("abc", [{ ...ok, date_time_format: "zz" }])).toThrow(/date_time_format/);
    expect(() => validateEntities("abc", [{ ...ok, unix_time: -1 }])).toThrow(/unix_time/);
    expect(() => validateEntities("abc", [{ ...ok, unix_time: undefined }])).toThrow(/unix_time/);
  });
});
