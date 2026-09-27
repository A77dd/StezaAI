import { GrammyError } from "grammy";
import { describe, expect, it } from "vitest";
import { CallbackExpiredError } from "../callbacks";
import {
  actionButton,
  copyButton,
  disabledButton,
  keyboard,
  renderMessage,
  row,
  switchInlineButton,
  text,
  urlButton,
  webAppButton,
} from "../render";
import { ALEX, BORIS, createGroupChat } from "../testing/participants";
import { createHandlerHarness } from "../testing/pipelineHarness";
import { sendCard } from "./presenter";

const harnessRunning = createHandlerHarness;

describe("sendCard: keyboards", () => {
  const everyKind = renderMessage({
    body: text("Выбери"),
    keyboard: keyboard(
      row(
        actionButton("Поставить", "slot.pick", { taskId: "task_1", slotIndex: 0, slotStart: "2026-09-28T09:30:00.000Z", slotEnd: "2026-09-28T10:30:00.000Z" }, "success"),
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
              actionButton("Поставить", "slot.pick", { taskId: "task_1", slotIndex: 1, slotStart: "2026-09-28T09:30:00.000Z", slotEnd: "2026-09-28T10:30:00.000Z" }),
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
