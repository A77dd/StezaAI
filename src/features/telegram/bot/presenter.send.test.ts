import { GrammyError } from "grammy";
import type { Message } from "grammy/types";
import { describe, expect, it } from "vitest";
import { CallbackExpiredError } from "../callbacks";
import {
  actionButton,
  copyButton,
  disabledButton,
  keyboard,
  renderMessage,
  renderRichMarkdown,
  row,
  switchInlineButton,
  text,
  urlButton,
  webAppButton,
} from "../render";
import { expectCall } from "../testing/assertions";
import { ALEX, BORIS, createGroupChat, createSupergroupChat } from "../testing/participants";
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

describe("sendCard: rich messages", () => {
  it("sends Rich Markdown through sendRichMessage", async () => {
    const h = harnessRunning(async (ctx) => {
      await sendCard(ctx, renderRichMarkdown("# Повестка\n\n| Время | Дело |\n|---|---|\n| 10:00 | Звонок |"));
    });

    await h.deliver(h.kit.updates.privateText("hi"));

    expect(h.kit.fake.callsTo("sendMessage")).toHaveLength(0);
    expect(h.kit.fake.lastCall("sendRichMessage")?.payload).toEqual({
      chat_id: ALEX.id,
      rich_message: { markdown: "# Повестка\n\n| Время | Дело |\n|---|---|\n| 10:00 | Звонок |" },
    });
  });

  it("gives a rich message a keyboard with tokens too", async () => {
    const h = harnessRunning(async (ctx) => {
      await sendCard(
        ctx,
        renderRichMarkdown("Итого", keyboard(row(actionButton("Хорошо", "noop", {})))),
      );
    });

    await h.deliver(h.kit.updates.privateText("hi"));

    expectCall(h.kit, "sendRichMessage", {
      reply_markup: { inline_keyboard: [[{ text: "Хорошо", callback_data: "v1:noop:tok00001" }]] },
    });
  });
});

describe("sendCard: keyboards", () => {
  const everyKind = renderMessage({
    body: text("Выбери"),
    keyboard: keyboard(
      row(
        actionButton("Поставить", "slot.pick", { taskId: "task_1", slotIndex: 0 }, "success"),
        actionButton("Другое время", "slot.other", { taskId: "task_1" }),
      ),
      row(urlButton("Сайт", "https://example.com/plan"), webAppButton("Открыть", "https://app.example.com/mini")),
      row(copyButton("Скопировать", "Встреча в 10:00")),
      row(
        switchInlineButton("Поделиться", "свободное время", "any"),
        switchInlineButton("Здесь", "свободное время", "current_chat"),
        switchInlineButton("Куда-то", "свободное время", "chosen_chat"),
      ),
      row(disabledButton("Поставлено")),
    ),
  });

  it("maps every kind of button to its Bot API field and the fake accepts it", async () => {
    const h = harnessRunning(async (ctx) => {
      await sendCard(ctx, everyKind);
    });

    await h.deliver(h.kit.updates.privateText("hi"));

    expect(h.kit.fake.lastCall("sendMessage")?.payload.reply_markup).toEqual({
      inline_keyboard: [
        [
          { text: "Поставить", callback_data: "v1:slot.pick:tok00001", style: "success" },
          { text: "Другое время", callback_data: "v1:slot.other:tok00002" },
        ],
        [
          { text: "Сайт", url: "https://example.com/plan" },
          { text: "Открыть", web_app: { url: "https://app.example.com/mini" } },
        ],
        [{ text: "Скопировать", copy_text: { text: "Встреча в 10:00" } }],
        [
          { text: "Поделиться", switch_inline_query: "свободное время" },
          { text: "Здесь", switch_inline_query_current_chat: "свободное время" },
          {
            text: "Куда-то",
            switch_inline_query_chosen_chat: {
              query: "свободное время",
              allow_user_chats: true,
              allow_group_chats: true,
            },
          },
        ],
        [{ text: "Поставлено", disabled: {} }],
      ],
    });
  });

  it("omits the query of a chosen-chat switch when it is empty", async () => {
    const h = harnessRunning(async (ctx) => {
      await sendCard(ctx, renderMessage({ body: text("x"), keyboard: keyboard(row(switchInlineButton("Куда", "", "chosen_chat"))) }));
    });

    await h.deliver(h.kit.updates.privateText("hi"));

    expect(h.kit.fake.lastCall("sendMessage")?.payload.reply_markup).toEqual({
      inline_keyboard: [[{ text: "Куда", switch_inline_query_chosen_chat: { allow_user_chats: true, allow_group_chats: true } }]],
    });
  });

  it("rejects a web_app button in a group instead of quietly dropping it", async () => {
    let failure: unknown;
    const h = harnessRunning(async (ctx) => {
      try {
        await sendCard(ctx, renderMessage({ body: text("x"), keyboard: keyboard(row(webAppButton("Открыть", "https://app.example.com/mini"))) }));
      } catch (error) {
        failure = error;
      }
    });

    await h.deliver(h.kit.updates.groupMention("@steza_test_bot hi"));

    expect(failure).toBeInstanceOf(GrammyError);
    expect(failure).toMatchObject({ error_code: 400 });
  });

  it("issues resolvable tokens owned by the user and chat, one per action button", async () => {
    const group = createGroupChat();
    const h = harnessRunning(async (ctx) => {
      await sendCard(
        ctx,
        renderMessage({
          body: text("Выбери"),
          keyboard: keyboard(
            row(
              actionButton("Поставить", "slot.pick", { taskId: "task_1", slotIndex: 1 }),
              actionButton("Другое", "slot.other", { taskId: "task_1" }),
            ),
          ),
        }),
      );
    });

    await h.deliver(h.kit.updates.groupMention("@steza_test_bot hi", { chat: group, from: ALEX }));

    const markup = h.kit.fake.lastCall("sendMessage")?.payload.reply_markup as {
      inline_keyboard: { callback_data: string }[][];
    };
    const [pick, other] = markup.inline_keyboard[0] ?? [];
    expect(pick?.callback_data).not.toBe(other?.callback_data);
    const owner = { userId: String(ALEX.id), chatId: group.id };
    await expect(h.services.callbacks.resolve(pick?.callback_data ?? "", owner)).resolves.toMatchObject({
      action: "slot.pick",
      payload: { taskId: "task_1", slotIndex: 1 },
    });
    // Someone else cannot use it.
    await expect(
      h.services.callbacks.resolve(other?.callback_data ?? "", { ...owner, userId: String(BORIS.id) }),
    ).rejects.toMatchObject({ code: "callback_not_found" });
  });

  it("leaves tokens of a card whose send failed to expire on their own", async () => {
    let failure: unknown;
    const h = harnessRunning(async (ctx) => {
      try {
        await sendCard(ctx, renderMessage({ body: text("x"), keyboard: keyboard(row(actionButton("Ок", "noop", {}))) }));
      } catch (error) {
        failure = error;
      }
    });
    h.kit.fake.failNext("sendMessage", { error_code: 400, description: "Bad Request: chat not found" });

    await h.deliver(h.kit.updates.privateText("hi"));

    expect(failure).toBeInstanceOf(GrammyError);
    // The orphaned token is still stored, and dies with its TTL.
    const data = "v1:noop:tok00001";
    const owner = { userId: String(ALEX.id), chatId: ALEX.id };
    await expect(h.services.callbacks.resolve(data, owner)).resolves.toMatchObject({ action: "noop" });
    const again = await h.services.callbacks.issue({ action: "noop", ...owner, payload: {} });
    h.kit.clock.advance(60 * 24 * 365);
    await expect(h.services.callbacks.resolve(again, owner)).rejects.toBeInstanceOf(CallbackExpiredError);
  });
});
