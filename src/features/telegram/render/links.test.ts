import { describe, expect, it } from "vitest";
import { RenderError } from "./errors";
import { botStartLink, miniAppLink } from "./links";

describe("botStartLink", () => {
  it("builds the deep link that opens the private chat with a start parameter", () => {
    expect(botStartLink("steza_test_bot", "g_abc-123")).toBe("https://t.me/steza_test_bot?start=g_abc-123");
  });

  it("accepts the 64-character payload limit and rejects 65", () => {
    expect(() => botStartLink("steza_test_bot", "a".repeat(64))).not.toThrow();
    expect(() => botStartLink("steza_test_bot", "a".repeat(65))).toThrow(RenderError);
  });

  it.each(["", "a b", "a&b=c", "привет", "a/b", "a?b", "a.b"])("rejects the payload %j", (payload) => {
    expect(() => botStartLink("steza_test_bot", payload)).toThrow(RenderError);
  });

  it.each(["", "bot", "@steza_test_bot", "steza test bot", "steza_test", "1steza_bot", "a".repeat(40) + "bot", "steza/bot"])(
    "rejects the bot username %j",
    (username) => {
      expect(() => botStartLink(username, "x")).toThrow(RenderError);
    },
  );

  it("accepts a bot username in any letter case", () => {
    expect(botStartLink("SteZA_Bot", "x")).toBe("https://t.me/SteZA_Bot?start=x");
  });

  it("does not echo a rejected value", () => {
    expect(() => botStartLink("steza_test_bot", "secret value")).toThrow(/^(?!.*secret)/);
  });
});

describe("miniAppLink", () => {
  it("returns the normalised base address without a path", () => {
    expect(miniAppLink("https://app.example.com")).toBe("https://app.example.com/");
  });

  it("appends path segments to the base path", () => {
    expect(miniAppLink("https://app.example.com/mini", "settings")).toBe("https://app.example.com/mini/settings");
    expect(miniAppLink("https://app.example.com/mini/", "tasks/t_1")).toBe(
      "https://app.example.com/mini/tasks/t_1",
    );
  });

  it("requires an absolute https base without query or fragment", () => {
    expect(() => miniAppLink("http://app.example.com")).toThrow(RenderError);
    expect(() => miniAppLink("app.example.com")).toThrow(RenderError);
    expect(() => miniAppLink("https://app.example.com/?a=1")).toThrow(RenderError);
    expect(() => miniAppLink("https://app.example.com/#x")).toThrow(RenderError);
  });

  it.each(["..", "a/../b", "a b", "a?x=1", "a#b", "/abs", "a//b", "a."])("rejects the path %j", (path) => {
    expect(() => miniAppLink("https://app.example.com", path)).toThrow(RenderError);
  });
});
