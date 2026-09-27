import { describe, expect, it } from "vitest";
import type { Update } from "grammy/types";
import { createMemoryLogger } from "@/features/telegram/bot";
import { createWebhookHandler } from "./webhook";

const SECRET = "test-webhook-secret";

function makeDeps(handleUpdate: (update: Update) => Promise<void> = async () => undefined) {
  const logger = createMemoryLogger();
  const handler = createWebhookHandler({ logger, secret: SECRET, handleUpdate });
  return { logger, handler };
}

function post(body: string, secret: string | null = SECRET): Request {
  return new Request("https://example.test/api/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret === null ? {} : { "x-telegram-bot-api-secret-token": secret }),
    },
    body,
  });
}

const UPDATE: Update = { update_id: 1, message: { message_id: 1, date: 0, chat: { id: 1, type: "private", first_name: "T" }, from: { id: 1, is_bot: false, first_name: "T" }, text: "hi" } };

describe("webhook handler", () => {
  it("rejects non-POST requests", async () => {
    const { handler } = makeDeps();
    const response = await handler(new Request("https://example.test/x", { method: "GET" }));
    expect(response.status).toBe(405);
  });

  it("answers 403 when the secret-token header is missing or wrong", async () => {
    const { handler, logger } = makeDeps();
    const missing = await handler(post(JSON.stringify(UPDATE), null));
    const wrong = await handler(post(JSON.stringify(UPDATE), "wrong-secret"));
    expect(missing.status).toBe(403);
    expect(wrong.status).toBe(403);
    expect(logger.records.filter((r) => r.event === "webhook.rejected")).toHaveLength(2);
  });

  it("answers 400 for a body that is not a Telegram Update", async () => {
    const { handler, logger } = makeDeps();
    for (const body of ["not json", "{}", '{"update_id":"one"}', "[1,2]"]) {
      const response = await handler(post(body));
      expect(response.status).toBe(400);
    }
    expect(logger.records.every((r) => r.event === "webhook.rejected" && r.reason === "invalid_body")).toBe(true);
  });

  it("hands a well-formed update to the bot and answers 200", async () => {
    const seen: Update[] = [];
    const { handler } = makeDeps(async (update) => {
      seen.push(update);
    });
    const response = await handler(post(JSON.stringify(UPDATE)));
    expect(response.status).toBe(200);
    expect(seen).toEqual([UPDATE]);
  });

  it("answers 500 when the update fails, so Telegram redelivers", async () => {
    const { handler, logger } = makeDeps(async () => {
      throw new Error("processing failed");
    });
    const response = await handler(post(JSON.stringify(UPDATE)));
    expect(response.status).toBe(500);
    expect(logger.records.some((r) => r.event === "webhook.update_failed" && r.errorCode === "unexpected")).toBe(true);
  });
});
