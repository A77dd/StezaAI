import { GrammyError, HttpError } from "grammy";
import type { Update } from "grammy/types";
import { describe, expect, it } from "vitest";
import { createFakeApiHarness } from "./fakeApiHarness";
import { fakeFailures } from "./fakeBotApi";

const CHAT = 1001;
const GROUP = -5_000_001;

async function failure(promise: Promise<unknown>): Promise<GrammyError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GrammyError) return error;
    throw error;
  }
  throw new Error("expected a GrammyError");
}

describe("failNext", () => {
  it("fails a call with 429 and retry_after in the parameters", async () => {
    const { api, fake } = createFakeApiHarness();
    fake.failNext("sendMessage", { error_code: 429, retry_after: 7 });

    const error = await failure(api.sendMessage(CHAT, "hi"));

    expect(error).toMatchObject({
      error_code: 429,
      description: "Too Many Requests: retry after 7",
      parameters: { retry_after: 7 },
    });
    expect(fake.messages.list()).toHaveLength(0);
  });

  it("fails only the requested number of calls of the requested method, in order", async () => {
    const { api, fake } = createFakeApiHarness();
    fake.failNext("sendMessage", fakeFailures.blockedByUser(), 2);

    await api.sendChatAction(CHAT, "typing");
    expect((await failure(api.sendMessage(CHAT, "1"))).description).toBe("Forbidden: bot was blocked by the user");
    expect((await failure(api.sendMessage(CHAT, "2"))).error_code).toBe(403);
    expect((await api.sendMessage(CHAT, "3")).text).toBe("3");
  });

  it("queues different failures for one method in the order they were added", async () => {
    const { api, fake } = createFakeApiHarness();
    fake.failNext("sendMessage", fakeFailures.tooManyRequests(1));
    fake.failNext("sendMessage", fakeFailures.serverError());

    expect((await failure(api.sendMessage(CHAT, "a"))).error_code).toBe(429);
    expect((await failure(api.sendMessage(CHAT, "b"))).error_code).toBe(502);
    expect((await api.sendMessage(CHAT, "c")).message_id).toBe(1);
  });

  it("supports the documented failures: not modified and query too old", async () => {
    const { api, fake } = createFakeApiHarness();
    fake.failNext("editMessageText", fakeFailures.messageNotModified());
    fake.failNext("answerCallbackQuery", fakeFailures.queryTooOld());

    expect((await failure(api.editMessageText(CHAT, 1, "x"))).description).toMatch(/^Bad Request: message is not modified/);
    expect((await failure(api.answerCallbackQuery("q"))).description).toMatch(/query is too old/);
  });

  it("throws an HttpError for a network failure and records it", async () => {
    const { api, fake } = createFakeApiHarness();
    fake.failNext("sendMessage", fakeFailures.networkError("socket hang up"));

    await expect(api.sendMessage(CHAT, "hi")).rejects.toBeInstanceOf(HttpError);
    expect(fake.lastCall()?.outcome).toEqual({ kind: "network_error", message: "socket hang up", delivered: false });
    expect(fake.messages.list()).toHaveLength(0);
  });

  it("applies the request before losing the response when asked to deliver then drop", async () => {
    const { api, fake } = createFakeApiHarness();
    fake.failNext("sendMessage", fakeFailures.networkErrorAfterDelivery());

    await expect(api.sendMessage(CHAT, "hi")).rejects.toBeInstanceOf(HttpError);

    expect(fake.messages.list(CHAT)).toHaveLength(1);
    expect(fake.lastCall()?.outcome).toMatchObject({ kind: "network_error", delivered: true });
  });

  it("loses the response of a rejected call too, and stores nothing, when set to deliver then drop", async () => {
    const { api, fake } = createFakeApiHarness();
    fake.failNext("sendMessage", fakeFailures.networkErrorAfterDelivery());

    await expect(api.sendMessage(CHAT, "")).rejects.toBeInstanceOf(HttpError);
    expect(fake.messages.list()).toHaveLength(0);
  });

  it("rejects a non positive count and forgets failures on reset", async () => {
    const { api, fake } = createFakeApiHarness();

    expect(() => fake.failNext("sendMessage", fakeFailures.serverError(), 0)).toThrow(RangeError);
    fake.failNext("sendMessage", fakeFailures.serverError());
    fake.reset();
    expect((await api.sendMessage(CHAT, "ok")).text).toBe("ok");
  });
});

describe("flood control", () => {
  it("is off by default", async () => {
    const { api } = createFakeApiHarness();

    await api.sendMessage(CHAT, "1");
    await api.sendMessage(CHAT, "2");
    await api.sendMessage(CHAT, "3");
  });

  it("rejects a second message within a second with 429 and retry_after", async () => {
    const { api, clock } = createFakeApiHarness({ rateLimits: true });
    await api.sendMessage(CHAT, "1");
    clock.advanceMs(400);

    const error = await failure(api.sendMessage(CHAT, "2"));

    expect(error).toMatchObject({ error_code: 429, parameters: { retry_after: 1 } });
  });

  it("admits the next message once the interval has passed and does not count rejected ones", async () => {
    const { api, clock, fake } = createFakeApiHarness({ rateLimits: true });
    await api.sendMessage(CHAT, "1");
    clock.advanceMs(999);
    await failure(api.sendMessage(CHAT, "2"));
    clock.advanceMs(1);

    expect((await api.sendMessage(CHAT, "3")).message_id).toBe(2);
    expect(fake.messages.list(CHAT)).toHaveLength(2);
  });

  it("limits chats independently and does not limit edits", async () => {
    const { api } = createFakeApiHarness({ rateLimits: true });
    const first = await api.sendMessage(CHAT, "1");
    await api.sendMessage(2002, "1");

    await api.editMessageText(CHAT, first.message_id, "edited");
  });

  it("limits a group to 20 messages per minute and reports when to retry", async () => {
    const { api, clock } = createFakeApiHarness({ rateLimits: true });
    for (let i = 0; i < 20; i += 1) {
      await api.sendMessage(GROUP, `m${i}`);
      clock.advanceMs(1000);
    }

    // 20 messages went out over 20 seconds; the first leaves the window at 60 s.
    const error = await failure(api.sendMessage(GROUP, "one too many"));
    expect(error).toMatchObject({ error_code: 429, parameters: { retry_after: 40 } });

    clock.advanceSeconds(40);
    await api.sendMessage(GROUP, "again");
  });

  it("limits the bot to 30 messages per second across all chats", async () => {
    const { api, clock } = createFakeApiHarness({ rateLimits: true });
    for (let chat = 1; chat <= 30; chat += 1) await api.sendMessage(chat, "broadcast");

    const error = await failure(api.sendMessage(31, "one too many"));
    expect(error).toMatchObject({ error_code: 429, parameters: { retry_after: 1 } });

    clock.advanceMs(1000);
    await api.sendMessage(31, "next second");
  });

  it("accepts custom limits", async () => {
    const { api, clock } = createFakeApiHarness({ rateLimits: { perChatIntervalMs: 3000 } });
    await api.sendMessage(CHAT, "1");
    clock.advanceMs(2000);

    expect(await failure(api.sendMessage(CHAT, "2"))).toMatchObject({ parameters: { retry_after: 1 } });
  });
});

function myChatMember(chat: NonNullable<Update["message"]>["chat"], status: "kicked" | "left" | "member"): Update {
  const user = { id: 900_000_001, is_bot: true as const, first_name: "Fake bot", username: "steza_test_bot" };
  return {
    update_id: 1,
    my_chat_member: {
      chat,
      from: { id: 1001, is_bot: false, first_name: "Alex" },
      date: 1,
      old_chat_member: { status: "member", user },
      new_chat_member: status === "kicked" ? { status, user, until_date: 0 } : status === "left" ? { status, user } : { status, user },
    },
  };
}

describe("blocked and removed chats", () => {
  it("answers sends to a user who blocked the bot with 403, and works again after unblocking", async () => {
    const { api, fake } = createFakeApiHarness();
    const chat = { id: CHAT, type: "private", first_name: "Alex" } as const;

    fake.observeUpdate(myChatMember(chat, "kicked"));
    expect(fake.isBlocked(CHAT)).toBe(true);
    const error = await failure(api.sendMessage(CHAT, "hi"));
    expect(error).toMatchObject({ error_code: 403, description: "Forbidden: bot was blocked by the user" });
    expect((await failure(api.sendMessageDraft(CHAT, 1, "x"))).error_code).toBe(403);
    expect((await failure(api.sendChatAction(CHAT, "typing"))).error_code).toBe(403);

    fake.observeUpdate(myChatMember(chat, "member"));
    expect(fake.isBlocked(CHAT)).toBe(false);
    expect((await api.sendMessage(CHAT, "hi")).text).toBe("hi");
  });

  it("answers sends to a group that removed the bot with 403", async () => {
    const { api, fake } = createFakeApiHarness();

    fake.observeUpdate(myChatMember({ id: GROUP, type: "group", title: "G" }, "kicked"));
    expect((await failure(api.sendMessage(GROUP, "hi"))).description).toBe("Forbidden: bot was kicked from the group chat");

    fake.observeUpdate(myChatMember({ id: GROUP, type: "group", title: "G" }, "left"));
    expect((await failure(api.sendMessage(GROUP, "hi"))).description).toBe("Forbidden: bot is not a member of the group chat");
  });

  describe("guest mode", () => {
    const guest = (chat: NonNullable<Update["message"]>["chat"]): Update => ({
      update_id: 1,
      guest_message: {
        message_id: 1,
        date: 1,
        chat,
        from: { id: 1001, is_bot: false, first_name: "Alex" },
        guest_query_id: "gq-1",
        text: "@steza_test_bot hi",
      },
    });

    it("refuses ordinary sends to a chat the bot was only called in, so the handler must use answerGuestQuery", async () => {
      const { api, fake } = createFakeApiHarness();

      fake.observeUpdate(guest({ id: GROUP, type: "supergroup", title: "S" }));

      expect((await failure(api.sendMessage(GROUP, "hi"))).description).toBe(
        "Forbidden: bot is not a member of the supergroup chat",
      );

      fake.observeUpdate(guest({ id: 1001, type: "private", first_name: "Alex" }));
      expect((await failure(api.sendMessage(1001, "hi"))).description).toBe(
        "Forbidden: bot can't initiate conversation with a user",
      );
    });

    it("allows sends again once the bot shows activity there as a member", async () => {
      const { api, fake } = createFakeApiHarness();
      const chat = { id: GROUP, type: "supergroup", title: "S" } as const;
      fake.observeUpdate(guest(chat));

      fake.observeUpdate({
        update_id: 2,
        message: { message_id: 2, date: 2, chat, from: { id: 1001, is_bot: false, first_name: "Alex" }, text: "/plan@steza_test_bot" },
      });

      expect((await api.sendMessage(GROUP, "hi")).text).toBe("hi");
    });

    it("does not cut off a chat the bot already knows", async () => {
      const { api, fake } = createFakeApiHarness();
      const chat = { id: GROUP, type: "supergroup", title: "S" } as const;
      fake.observeUpdate({
        update_id: 1,
        message: { message_id: 1, date: 1, chat, from: { id: 1001, is_bot: false, first_name: "Alex" }, text: "hello" },
      });

      fake.observeUpdate(guest(chat));

      expect((await api.sendMessage(GROUP, "hi")).text).toBe("hi");
    });
  });
});
