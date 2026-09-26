import { Composer, GrammyError } from "grammy";
import type { Message } from "grammy/types";
import { describe, expect, it } from "vitest";
import {
  actionButton,
  disabledButton,
  keyboard,
  renderMessage,
  renderRichMarkdown,
  row,
  text,
} from "../render";
import { ALEX } from "../testing/participants";
import { createPipelineHarness } from "../testing/pipelineHarness";
import type { BotContext } from "./context";
import { answerCallback, editCard, editCardMarkup, sendCard, targetOfCallback } from "./presenter";

const plain = renderMessage({ body: text("Готово") });

describe("editCard", () => {
  it("edits text and keyboard in place and reports edited", async () => {
    let outcome: string | undefined;
    const composer = new Composer<BotContext>();
    let sent: Message | undefined;
    composer.on("message:text", async (ctx) => {
      sent = await sendCard(ctx, renderMessage({ body: text("Было"), keyboard: keyboard(row(actionButton("Ок", "noop", {}))) }));
      outcome = await editCard(
        ctx,
        { kind: "chat", chatId: ctx.chat.id, messageId: sent.message_id },
        renderMessage({ body: text("Стало"), keyboard: keyboard(row(disabledButton("Готово"))) }),
      );
    });
    const h = createPipelineHarness({ composers: [composer] });

    await h.deliver(h.kit.updates.privateText("hi"));

    expect(outcome).toBe("edited");
    expect(h.kit.fake.lastCall("editMessageText")?.payload).toEqual({
      chat_id: ALEX.id,
      message_id: sent?.message_id,
      text: "Стало",
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [[{ text: "Готово", disabled: {} }]] },
    });
    expect(h.kit.fake.messages.get(ALEX.id, sent?.message_id ?? 0)?.message.text).toBe("Стало");
  });

  it("removes the keyboard when the new card has none", async () => {
    const composer = new Composer<BotContext>();
    composer.on("message:text", async (ctx) => {
      const sent = await sendCard(ctx, renderMessage({ body: text("Было"), keyboard: keyboard(row(actionButton("Ок", "noop", {}))) }));
      await editCard(ctx, { kind: "chat", chatId: ctx.chat.id, messageId: sent.message_id }, renderMessage({ body: text("Стало") }));
    });
    const h = createPipelineHarness({ composers: [composer] });

    await h.deliver(h.kit.updates.privateText("hi"));

    expect(h.kit.fake.lastCall("editMessageText")?.payload.reply_markup).toBeUndefined();
    expect(h.kit.fake.messages.sentByBot(ALEX.id)[0]?.message.reply_markup).toBeUndefined();
  });

  it("returns unchanged when Telegram says the message is not modified", async () => {
    const outcomes: string[] = [];
    const composer = new Composer<BotContext>();
    composer.on("message:text", async (ctx) => {
      const card = renderMessage({ body: text("Так") });
      const sent = await sendCard(ctx, card);
      const target = { kind: "chat", chatId: ctx.chat.id, messageId: sent.message_id } as const;
      outcomes.push(await editCard(ctx, target, card));
      outcomes.push(await editCard(ctx, target, renderMessage({ body: text("Иначе") })));
      outcomes.push(await editCard(ctx, target, renderMessage({ body: text("Иначе") })));
    });
    const h = createPipelineHarness({ composers: [composer] });

    await h.deliver(h.kit.updates.privateText("hi"));

    expect(outcomes).toEqual(["unchanged", "edited", "unchanged"]);
  });

  it("propagates every other edit failure (message gone) as a Bot API error", async () => {
    let failure: unknown;
    const composer = new Composer<BotContext>();
    composer.on("message:text", async (ctx) => {
      try {
        await editCard(ctx, { kind: "chat", chatId: ctx.chat.id, messageId: 999 }, plain);
      } catch (error) {
        failure = error;
      }
    });
    const h = createPipelineHarness({ composers: [composer] });

    await h.deliver(h.kit.updates.privateText("hi"));

    expect(failure).toBeInstanceOf(GrammyError);
    expect(failure).toMatchObject({ error_code: 400 });
  });

  it("edits an inline message through inline_message_id", async () => {
    const composer = new Composer<BotContext>();
    composer.on("callback_query", async (ctx) => {
      await editCard(
        ctx,
        targetOfCallback(ctx),
        renderMessage({ body: text("Обновлено"), keyboard: keyboard(row(actionButton("Ок", "noop", {}))) }),
      );
      await answerCallback(ctx);
    });
    const h = createPipelineHarness({ composers: [composer] });
    const inlineId = "inline-message-1";
    h.kit.fake.observeUpdate({ update_id: 1, chosen_inline_result: { result_id: "r", from: ALEX, query: "q", inline_message_id: inlineId } });

    await h.deliver(h.kit.updates.inlineMessageCallbackQuery(inlineId, "v1:noop:tok00001", { from: ALEX }));

    expect(h.kit.fake.lastCall("editMessageText")?.payload).toMatchObject({
      inline_message_id: inlineId,
      text: "Обновлено",
      reply_markup: { inline_keyboard: [[{ text: "Ок", callback_data: expect.stringMatching(/^v1:noop:/) as unknown }]] },
    });
    expect(h.kit.fake.lastCall("editMessageText")?.payload.chat_id).toBeUndefined();
  });

  it("edits a text message into rich content with rich_message", async () => {
    const composer = new Composer<BotContext>();
    composer.on("message:text", async (ctx) => {
      const sent = await sendCard(ctx, renderRichMarkdown("Один"));
      await editCard(ctx, { kind: "chat", chatId: ctx.chat.id, messageId: sent.message_id }, renderRichMarkdown("Два"));
    });
    const h = createPipelineHarness({ composers: [composer] });

    await h.deliver(h.kit.updates.privateText("hi"));

    expect(h.kit.fake.lastCall("editMessageText")?.payload).toEqual({
      chat_id: ALEX.id,
      message_id: expect.any(Number) as unknown,
      rich_message: { markdown: "Два" },
    });
  });
});

describe("editCardMarkup", () => {
  it("replaces only the keyboard, and null removes it", async () => {
    const outcomes: string[] = [];
    const composer = new Composer<BotContext>();
    composer.on("message:text", async (ctx) => {
      const sent = await sendCard(ctx, renderMessage({ body: text("Карточка"), keyboard: keyboard(row(actionButton("Ок", "noop", {}))) }));
      const target = { kind: "chat", chatId: ctx.chat.id, messageId: sent.message_id } as const;
      outcomes.push(await editCardMarkup(ctx, target, keyboard(row(disabledButton("Готово")))));
      outcomes.push(await editCardMarkup(ctx, target, keyboard(row(disabledButton("Готово")))));
      outcomes.push(await editCardMarkup(ctx, target, null));
    });
    const h = createPipelineHarness({ composers: [composer] });

    await h.deliver(h.kit.updates.privateText("hi"));

    expect(outcomes).toEqual(["edited", "unchanged", "edited"]);
    expect(h.kit.fake.messages.sentByBot(ALEX.id)[0]?.message.text).toBe("Карточка");
    expect(h.kit.fake.messages.sentByBot(ALEX.id)[0]?.message.reply_markup).toBeUndefined();
  });
});
