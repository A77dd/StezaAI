import { describe, expect, it } from "vitest";
import {
  readChatMenuButton,
  readCommandScope,
  readDefaultAdministratorRights,
  readProfileText,
  readSetMyCommands,
} from "./profile";
import { ApiRejection } from "./rejection";

function rejection(action: () => unknown): ApiRejection {
  try {
    action();
  } catch (error) {
    if (error instanceof ApiRejection) return error;
    throw error;
  }
  throw new Error("expected an ApiRejection");
}

const start = { command: "start", description: "Start" };

describe("readSetMyCommands", () => {
  it("accepts commands with a default scope and no language", () => {
    expect(readSetMyCommands({ commands: [start] })).toEqual({
      commands: [start],
      scopeKey: "default",
      languageCode: "",
    });
  });

  it("accepts up to 100 commands and rejects 101", () => {
    const commands = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ command: `cmd${i}`, description: "d" }));
    expect(readSetMyCommands({ commands: commands(100) }).commands).toHaveLength(100);
    expect(rejection(() => readSetMyCommands({ commands: commands(101) })).errorCode).toBe(400);
    expect(readSetMyCommands({ commands: [] }).commands).toEqual([]);
  });

  it.each(["Start", "start-now", "start now", "", "a".repeat(33), "старт", "/start"])(
    "rejects the command name %j",
    (command) => {
      expect(rejection(() => readSetMyCommands({ commands: [{ command, description: "d" }] })).description).toBe(
        "Bad Request: BOT_COMMAND_INVALID",
      );
    },
  );

  it.each(["a", "a".repeat(32), "snake_case_9"])("accepts the command name %j", (command) => {
    expect(readSetMyCommands({ commands: [{ command, description: "d" }] }).commands).toHaveLength(1);
  });

  it("limits descriptions to 1-256 characters", () => {
    expect(readSetMyCommands({ commands: [{ command: "a", description: "d".repeat(256) }] })).toBeDefined();
    for (const description of ["", "d".repeat(257)]) {
      expect(rejection(() => readSetMyCommands({ commands: [{ command: "a", description }] })).description).toBe(
        "Bad Request: BOT_COMMAND_DESCRIPTION_INVALID",
      );
    }
  });

  it("requires a commands array of objects", () => {
    expect(rejection(() => readSetMyCommands({})).errorCode).toBe(400);
    expect(rejection(() => readSetMyCommands({ commands: "start" })).errorCode).toBe(400);
    expect(rejection(() => readSetMyCommands({ commands: ["start"] })).errorCode).toBe(400);
    expect(rejection(() => readSetMyCommands({ commands: [{ ...start, is_ephemeral: "yes" }] })).errorCode).toBe(400);
  });

  it("keys the list by scope and language", () => {
    expect(readSetMyCommands({ commands: [start], scope: { type: "all_private_chats" }, language_code: "ru" })).toMatchObject({
      scopeKey: "all_private_chats",
      languageCode: "ru",
    });
  });
});

describe("readCommandScope", () => {
  it("defaults to the default scope", () => {
    expect(readCommandScope(undefined)).toBe("default");
  });

  it.each(["default", "all_private_chats", "all_group_chats", "all_chat_administrators"])("accepts %s", (type) => {
    expect(readCommandScope({ type })).toBe(type);
  });

  it("requires a chat for chat scopes and a user for chat_member", () => {
    expect(readCommandScope({ type: "chat", chat_id: -100 })).toBe("chat:-100");
    expect(readCommandScope({ type: "chat_administrators", chat_id: "@some_channel" })).toBe(
      "chat_administrators:@some_channel",
    );
    expect(readCommandScope({ type: "chat_member", chat_id: -100, user_id: 5 })).toBe("chat_member:-100:5");
    expect(rejection(() => readCommandScope({ type: "chat" })).errorCode).toBe(400);
    expect(rejection(() => readCommandScope({ type: "chat_member", chat_id: -100 })).errorCode).toBe(400);
  });

  it("rejects an unknown scope", () => {
    expect(rejection(() => readCommandScope({ type: "everywhere" })).errorCode).toBe(400);
    expect(rejection(() => readCommandScope("default")).errorCode).toBe(400);
  });
});

describe("language codes", () => {
  it.each(["ru", "en", ""])("accepts %j", (languageCode) => {
    expect(readSetMyCommands({ commands: [start], language_code: languageCode }).languageCode).toBe(languageCode);
  });

  it.each(["RU", "rus", "r", "12", "ru-RU"])("rejects %j", (languageCode) => {
    expect(rejection(() => readSetMyCommands({ commands: [start], language_code: languageCode })).errorCode).toBe(400);
  });
});

describe("readProfileText", () => {
  const name = { field: "name", maximum: 64 } as const;

  it("accepts up to the limit and an empty string that removes the value", () => {
    expect(readProfileText({ name: "a".repeat(64) }, name)).toEqual({ value: "a".repeat(64), languageCode: "" });
    expect(readProfileText({ name: "", language_code: "ru" }, name)).toEqual({ value: "", languageCode: "ru" });
    expect(readProfileText({}, name).value).toBe("");
  });

  it("rejects text over the limit, counted in characters", () => {
    expect(rejection(() => readProfileText({ name: "a".repeat(65) }, name)).errorCode).toBe(400);
    expect(readProfileText({ name: "😀".repeat(64) }, name).value).toHaveLength(128);
    expect(rejection(() => readProfileText({ description: "a".repeat(513) }, { field: "description", maximum: 512 })).errorCode)
      .toBe(400);
    expect(
      rejection(() => readProfileText({ short_description: "a".repeat(121) }, { field: "short_description", maximum: 120 }))
        .errorCode,
    ).toBe(400);
  });

  it("rejects a non string value", () => {
    expect(rejection(() => readProfileText({ name: 5 }, name)).errorCode).toBe(400);
  });
});

describe("readChatMenuButton", () => {
  it("accepts commands, default and web_app buttons", () => {
    expect(readChatMenuButton({ menu_button: { type: "commands" } })).toEqual({
      chatId: undefined,
      button: { type: "commands" },
    });
    expect(readChatMenuButton({ chat_id: 100, menu_button: { type: "default" } }).chatId).toBe(100);
    expect(
      readChatMenuButton({ menu_button: { type: "web_app", text: "Open", web_app: { url: "https://app.example.com" } } })
        .button,
    ).toEqual({ type: "web_app", text: "Open", web_app: { url: "https://app.example.com" } });
  });

  it("defaults to the default button", () => {
    expect(readChatMenuButton({}).button).toEqual({ type: "default" });
  });

  it("rejects http web apps, missing text, unknown types and non private chats", () => {
    expect(
      rejection(() => readChatMenuButton({ menu_button: { type: "web_app", text: "Open", web_app: { url: "http://a.example.com" } } }))
        .errorCode,
    ).toBe(400);
    expect(
      rejection(() => readChatMenuButton({ menu_button: { type: "web_app", text: "", web_app: { url: "https://a.example.com" } } }))
        .errorCode,
    ).toBe(400);
    expect(rejection(() => readChatMenuButton({ menu_button: { type: "grid" } })).errorCode).toBe(400);
    expect(rejection(() => readChatMenuButton({ chat_id: -100, menu_button: { type: "commands" } })).errorCode).toBe(400);
  });
});

describe("readDefaultAdministratorRights", () => {
  it("accepts a rights object and for_channels", () => {
    expect(
      readDefaultAdministratorRights({ rights: { can_delete_messages: true, can_pin_messages: false }, for_channels: false }),
    ).toEqual({ rights: { can_delete_messages: true, can_pin_messages: false }, forChannels: false });
  });

  it("clears the rights when none are given", () => {
    expect(readDefaultAdministratorRights({})).toEqual({ rights: undefined, forChannels: false });
  });

  it("rejects unknown rights and non boolean values", () => {
    expect(rejection(() => readDefaultAdministratorRights({ rights: { can_fly: true } })).errorCode).toBe(400);
    expect(rejection(() => readDefaultAdministratorRights({ rights: { can_delete_messages: "yes" } })).errorCode).toBe(400);
    expect(rejection(() => readDefaultAdministratorRights({ rights: "all" })).errorCode).toBe(400);
  });
});
