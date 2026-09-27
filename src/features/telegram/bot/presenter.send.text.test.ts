import { GrammyError } from "grammy";
import type { Message } from "grammy/types";
import { describe, expect, it } from "vitest";
import { renderMessage, text } from "../render";
import { expectCall } from "../testing/assertions";
import { ALEX, createGroupChat, createSupergroupChat } from "../testing/participants";
import { createHandlerHarness } from "../testing/pipelineHarness";
import { PresenterError } from "./errors";
import { sendCard } from "./presenter";

const harnessRunning = createHandlerHarness;
const plain = renderMessage({ body: text("Готово") });

describe("sendCard: text messages", () => {
  it("sends HTML with link previews disabled and no reply_markup for a card without keyboard", async () => {
    const h = harnessRunning(async (ctx) => {
      await sendCard(ctx, plain);
    });

    await h.deliver(h.kit.updates.privateText("hi"));

    const payload = h.kit.fake.lastCall("sendMessage")?.payload;
    expect(payload).toEqual({
      chat_id: ALEX.id,
      text: "Готово",
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  it("returns the sent message", async () => {
    let sent: Message | undefined;
    const h = harnessRunning(async (ctx) => {
      sent = await sendCard(ctx, plain);
    });

    await h.deliver(h.kit.updates.privateText("hi"));

    expect(sent?.text).toBe("Готово");
  });

  it("replies to the invoking message in a group when asked, and survives its deletion", async () => {
    const group = createGroupChat();
    const h = harnessRunning(async (ctx) => {
      await sendCard(ctx, plain, { replyToInvoking: true });
    });
    const update = h.kit.updates.groupMention("@steza_test_bot plan", { chat: group });

    await h.deliver(update);

    expectCall(h.kit, "sendMessage", {
      chat_id: group.id,
      reply_parameters: { message_id: update.message.message_id, allow_sending_without_reply: true },
    });
  });

  it("does not reply unless asked to", async () => {
    const h = harnessRunning(async (ctx) => {
      await sendCard(ctx, plain);
    });

    await h.deliver(h.kit.updates.groupMention("@steza_test_bot plan"));

    expect(h.kit.fake.lastCall("sendMessage")?.payload.reply_parameters).toBeUndefined();
  });

  it("answers a topic message inside its topic", async () => {
    const forum = createSupergroupChat({ is_forum: true });
    const h = harnessRunning(async (ctx) => {
      await sendCard(ctx, plain);
    });

    await h.deliver(h.kit.updates.topicMessage("@steza_test_bot plan", { chat: forum, threadId: 7 }));

    expectCall(h.kit, "sendMessage", { chat_id: forum.id, message_thread_id: 7 });
  });

  it("does not send a thread id for a plain reply chain in a normal supergroup", async () => {
    const group = createSupergroupChat();
    const h = harnessRunning(async (ctx) => {
      await sendCard(ctx, plain);
    });
    const original = h.kit.updates.groupMention("@steza_test_bot plan", { chat: group }).message;
    h.kit.fake.registerIncomingMessage(original);
    const reply = h.kit.updates.groupReply("@steza_test_bot more", original, { chat: group });

    await h.deliver(reply);

    expect(h.kit.fake.lastCall("sendMessage")?.payload.message_thread_id).toBeUndefined();
  });

  it("can send silently and to another chat without carrying the update's topic or reply", async () => {
    const forum = createSupergroupChat({ is_forum: true });
    const h = harnessRunning(async (ctx) => {
      await sendCard(ctx, plain, { silent: true, chatId: ALEX.id, replyToInvoking: true });
    });

    await h.deliver(h.kit.updates.topicMessage("@steza_test_bot plan", { chat: forum, threadId: 7, from: ALEX }));

    const payload = h.kit.fake.lastCall("sendMessage")?.payload;
    expect(payload).toMatchObject({ chat_id: ALEX.id, disable_notification: true });
    expect(payload?.message_thread_id).toBeUndefined();
    expect(payload?.reply_parameters).toBeUndefined();
  });

  it("fails loudly when the update has no chat", async () => {
    let failure: unknown;
    const h = harnessRunning(async (ctx) => {
      try {
        await sendCard(ctx, plain);
      } catch (error) {
        failure = error;
      }
    });

    await h.deliver(h.kit.updates.inlineQuery("q"));

    expect(failure).toBeInstanceOf(PresenterError);
  });

  it("does not swallow a Bot API rejection", async () => {
    let failure: unknown;
    const h = harnessRunning(async (ctx) => {
      try {
        await sendCard(ctx, plain);
      } catch (error) {
        failure = error;
      }
    });
    h.kit.fake.failNext("sendMessage", { error_code: 400, description: "Bad Request: chat not found" });

    await h.deliver(h.kit.updates.privateText("hi"));

    expect(failure).toBeInstanceOf(GrammyError);
  });
});
