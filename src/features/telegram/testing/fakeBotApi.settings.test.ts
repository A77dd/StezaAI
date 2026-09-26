import { GrammyError } from "grammy";
import type { ChatAdministratorRights } from "grammy/types";
import { describe, expect, it } from "vitest";
import { createFakeApiHarness } from "./fakeApiHarness";

async function failure(promise: Promise<unknown>): Promise<GrammyError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GrammyError) return error;
    throw error;
  }
  throw new Error("expected a GrammyError");
}

const NO_RIGHTS: ChatAdministratorRights = {
  is_anonymous: false,
  can_manage_chat: false,
  can_delete_messages: false,
  can_manage_video_chats: false,
  can_restrict_members: false,
  can_promote_members: false,
  can_change_info: false,
  can_invite_users: false,
  can_post_stories: false,
  can_edit_stories: false,
  can_delete_stories: false,
  can_send_welcome_messages: false,
};

describe("commands", () => {
  it("stores a command list per scope and language", async () => {
    const { api, fake } = createFakeApiHarness();

    await api.setMyCommands([{ command: "start", description: "Start" }], { scope: { type: "all_private_chats" }, language_code: "ru" });
    await api.setMyCommands([{ command: "help", description: "Help" }]);

    expect(await api.getMyCommands({ scope: { type: "all_private_chats" }, language_code: "ru" })).toEqual([
      { command: "start", description: "Start" },
    ]);
    expect(await api.getMyCommands()).toEqual([{ command: "help", description: "Help" }]);
    expect(await api.getMyCommands({ language_code: "en" })).toEqual([]);
    expect(fake.profile.commands("all_private_chats", "ru")).toHaveLength(1);
    expect([...fake.profile.allCommands().keys()]).toEqual(["all_private_chats|ru", "default|"]);
  });

  it("deletes a list", async () => {
    const { api } = createFakeApiHarness();
    await api.setMyCommands([{ command: "start", description: "Start" }]);

    await api.deleteMyCommands();

    expect(await api.getMyCommands()).toEqual([]);
  });

  it("rejects invalid commands like the real API", async () => {
    const { api } = createFakeApiHarness();

    expect((await failure(api.setMyCommands([{ command: "Start", description: "x" }]))).description).toBe(
      "Bad Request: BOT_COMMAND_INVALID",
    );
    expect((await failure(api.setMyCommands([{ command: "start", description: "" }]))).description).toBe(
      "Bad Request: BOT_COMMAND_DESCRIPTION_INVALID",
    );
    expect((await failure(api.setMyCommands(Array.from({ length: 101 }, (_, i) => ({ command: `c${i}`, description: "d" }))))).error_code).toBe(400);
  });
});

describe("bot profile", () => {
  it("stores localized name, description and short description", async () => {
    const { api, fake } = createFakeApiHarness();

    await api.setMyName("Стезя", { language_code: "ru" });
    await api.setMyDescription("Планирование", { language_code: "ru" });
    await api.setMyShortDescription("Помощник", { language_code: "ru" });

    expect(await api.getMyName({ language_code: "ru" })).toEqual({ name: "Стезя" });
    expect(await api.getMyDescription({ language_code: "ru" })).toEqual({ description: "Планирование" });
    expect(await api.getMyShortDescription({ language_code: "ru" })).toEqual({ short_description: "Помощник" });
    expect(fake.profile.names().get("ru")).toBe("Стезя");
    expect(await api.getMyName({ language_code: "en" })).toEqual({ name: "Fake bot" });
  });

  it("removes a localization with an empty string and enforces the limits", async () => {
    const { api } = createFakeApiHarness();
    await api.setMyDescription("x", { language_code: "ru" });

    await api.setMyDescription("", { language_code: "ru" });
    expect(await api.getMyDescription({ language_code: "ru" })).toEqual({ description: "" });

    expect((await failure(api.setMyName("a".repeat(65)))).error_code).toBe(400);
    expect((await failure(api.setMyDescription("a".repeat(513)))).error_code).toBe(400);
    expect((await failure(api.setMyShortDescription("a".repeat(121)))).error_code).toBe(400);
  });

  it("stores the menu button per chat and the default one", async () => {
    const { api, fake } = createFakeApiHarness();

    await api.setChatMenuButton({ menu_button: { type: "web_app", text: "Open", web_app: { url: "https://app.example.com" } } });

    expect(await api.getChatMenuButton()).toEqual({ type: "web_app", text: "Open", web_app: { url: "https://app.example.com" } });
    expect(fake.profile.menuButton(5)).toMatchObject({ type: "web_app" });
    await api.setChatMenuButton({ chat_id: 5, menu_button: { type: "commands" } });
    expect(await api.getChatMenuButton({ chat_id: 5 })).toEqual({ type: "commands" });
    expect(
      (await failure(api.setChatMenuButton({ menu_button: { type: "web_app", text: "Open", web_app: { url: "http://app.example.com" } } }))).error_code,
    ).toBe(400);
  });

  it("stores default administrator rights and reports every right", async () => {
    const { api } = createFakeApiHarness();

    await api.setMyDefaultAdministratorRights({
      rights: { ...NO_RIGHTS, can_delete_messages: true, can_pin_messages: true },
    });

    expect(await api.getMyDefaultAdministratorRights()).toMatchObject({
      can_delete_messages: true,
      can_pin_messages: true,
      is_anonymous: false,
    });
    await api.setMyDefaultAdministratorRights();
    expect(await api.getMyDefaultAdministratorRights()).toMatchObject({ can_delete_messages: false });
  });
});

describe("webhook", () => {
  const url = "https://bot.example.com/api/telegram/webhook";

  it("sets, reports and deletes a webhook", async () => {
    const { api, fake } = createFakeApiHarness();

    await api.setWebhook(url, { secret_token: "s3cret_token", allowed_updates: ["message", "callback_query"], max_connections: 10 });

    expect(await api.getWebhookInfo()).toMatchObject({
      url,
      has_custom_certificate: false,
      pending_update_count: 0,
      max_connections: 10,
      allowed_updates: ["message", "callback_query"],
    });
    expect(fake.profile.webhook()).toMatchObject({ url, secretToken: "s3cret_token" });

    await api.deleteWebhook();
    expect(await api.getWebhookInfo()).toMatchObject({ url: "" });
  });

  it("treats an empty url as removing the webhook", async () => {
    const { api } = createFakeApiHarness();
    await api.setWebhook(url);

    await api.setWebhook("");

    expect((await api.getWebhookInfo()).url).toBe("");
  });

  it("rejects what the real API rejects", async () => {
    const { api } = createFakeApiHarness();

    expect((await failure(api.setWebhook("http://bot.example.com/hook"))).description).toMatch(/HTTPS url must be provided/);
    expect((await failure(api.setWebhook(url, { secret_token: "bad secret" }))).description).toBe(
      "Bad Request: secret token contains unallowed characters",
    );
    expect((await failure(api.setWebhook(url, { allowed_updates: ["messages" as "message"] }))).error_code).toBe(400);
    expect((await failure(api.setWebhook(url, { max_connections: 101 }))).error_code).toBe(400);
  });
});
