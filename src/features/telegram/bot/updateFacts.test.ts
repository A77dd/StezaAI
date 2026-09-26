import { describe, expect, it } from "vitest";
import { chatContextOf, chatTypeOf, deriveLocale, updateKindOf } from "./updateFacts";

describe("deriveLocale", () => {
  it.each([
    ["ru", "ru"],
    ["ru-RU", "ru"],
    ["RU", "ru"],
    ["en", "en"],
    ["en-US", "en"],
    ["en_GB", "en"],
  ] as const)("maps %s to %s", (code, locale) => {
    expect(deriveLocale(code)).toBe(locale);
  });

  it.each(["de", "uk", "pt-BR", "", "und"])(
    "falls back to the product default (ru) for %j",
    (code) => {
      expect(deriveLocale(code)).toBe("ru");
    },
  );

  it("falls back to the product default (ru) when the client sent no language", () => {
    expect(deriveLocale(undefined)).toBe("ru");
  });
});

describe("chatContextOf", () => {
  it.each([
    ["private", "PERSONAL"],
    ["sender", "PERSONAL"],
    ["group", "CHAT"],
    ["supergroup", "CHAT"],
    ["channel", "CHAT"],
  ] as const)("maps a %s chat to %s", (type, context) => {
    expect(chatContextOf({ type })).toBe(context);
  });

  it("treats an update without a chat as the user acting for themselves", () => {
    expect(chatContextOf(undefined)).toBe("PERSONAL");
  });
});

describe("updateKindOf / chatTypeOf", () => {
  it("names the one field of the update that is not update_id", () => {
    expect(updateKindOf({ update_id: 1, callback_query: {} } as never)).toBe("callback_query");
    expect(updateKindOf({ update_id: 1 } as never)).toBe("unknown");
  });

  it("uses the chat type, else the inline query chat type, else none", () => {
    expect(chatTypeOf({ chat: { type: "supergroup" } })).toBe("supergroup");
    expect(chatTypeOf({ inlineQuery: { chat_type: "sender" } })).toBe("sender");
    expect(chatTypeOf({ inlineQuery: {} })).toBe("none");
    expect(chatTypeOf({})).toBe("none");
  });
});
