import { describe, expect, it } from "vitest";
import { ApiRejection } from "./rejection";
import { UPDATE_TYPES, readSetWebhook } from "./webhook";

function rejection(action: () => unknown): ApiRejection {
  try {
    action();
  } catch (error) {
    if (error instanceof ApiRejection) return error;
    throw error;
  }
  throw new Error("expected an ApiRejection");
}

const url = "https://bot.example.com/api/telegram/webhook";

describe("readSetWebhook", () => {
  it("accepts an https url with the optional settings", () => {
    expect(
      readSetWebhook({
        url,
        secret_token: "abc_DEF-123",
        allowed_updates: ["message", "callback_query", "guest_message"],
        max_connections: 10,
        drop_pending_updates: true,
        ip_address: "203.0.113.5",
      }),
    ).toEqual({
      url,
      secretToken: "abc_DEF-123",
      allowedUpdates: ["message", "callback_query", "guest_message"],
      maxConnections: 10,
      dropPendingUpdates: true,
    });
  });

  it("treats an empty url as removing the webhook", () => {
    expect(readSetWebhook({ url: "" }).url).toBe("");
  });

  it("rejects urls that are not https", () => {
    for (const bad of ["http://bot.example.com/hook", "bot.example.com", "ftp://bot.example.com", "https://"]) {
      expect(rejection(() => readSetWebhook({ url: bad })).description).toBe(
        "Bad Request: bad webhook: HTTPS url must be provided for webhook",
      );
    }
    expect(rejection(() => readSetWebhook({})).errorCode).toBe(400);
  });

  it.each(["https://bot.example.com:443/h", "https://bot.example.com:88/h", "https://bot.example.com:8443/h", "https://bot.example.com/h"])(
    "accepts the supported port of %s",
    (allowed) => {
      expect(readSetWebhook({ url: allowed }).url).toBe(allowed);
    },
  );

  it("rejects ports Telegram does not deliver to", () => {
    expect(rejection(() => readSetWebhook({ url: "https://bot.example.com:3000/h" })).description).toMatch(
      /ports 80, 88, 443 or 8443/,
    );
  });

  it("limits secret_token to 1-256 characters of A-Za-z0-9_-", () => {
    expect(readSetWebhook({ url, secret_token: "a".repeat(256) }).secretToken).toHaveLength(256);
    expect(rejection(() => readSetWebhook({ url, secret_token: "a".repeat(257) })).description).toMatch(/secret token/);
    expect(rejection(() => readSetWebhook({ url, secret_token: "" })).errorCode).toBe(400);
    for (const bad of ["a b", "a.b", "секрет", "a+b", "a/b"]) {
      expect(rejection(() => readSetWebhook({ url, secret_token: bad })).description).toBe(
        "Bad Request: secret token contains unallowed characters",
      );
    }
  });

  it("accepts every Update field as an allowed update and nothing else", () => {
    for (const type of UPDATE_TYPES) {
      expect(readSetWebhook({ url, allowed_updates: [type] }).allowedUpdates).toEqual([type]);
    }
    expect(UPDATE_TYPES).toContain("stopped_message_generation");
    expect(UPDATE_TYPES).toContain("guest_message");
    expect(UPDATE_TYPES).not.toContain("update_id");
    expect(rejection(() => readSetWebhook({ url, allowed_updates: ["messages"] })).errorCode).toBe(400);
    expect(rejection(() => readSetWebhook({ url, allowed_updates: "message" })).errorCode).toBe(400);
  });

  it("limits max_connections to 1-100", () => {
    expect(readSetWebhook({ url, max_connections: 100 }).maxConnections).toBe(100);
    expect(readSetWebhook({ url, max_connections: 1 }).maxConnections).toBe(1);
    expect(rejection(() => readSetWebhook({ url, max_connections: 0 })).errorCode).toBe(400);
    expect(rejection(() => readSetWebhook({ url, max_connections: 101 })).errorCode).toBe(400);
  });
});
