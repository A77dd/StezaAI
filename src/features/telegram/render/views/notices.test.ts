import { describe, expect, it } from "vitest";
import {
  CallbackExpiredError,
  CallbackMalformedError,
  CallbackNotFoundError,
  CallbackReplayedError,
  CallbackTooLongError,
  CallbackUnknownActionError,
  CallbackVersionError,
} from "../../callbacks";
import type { CallbackNotFoundReason } from "../../callbacks";
import { InvalidTimezoneError, NotFoundError, SlotConflictError, TelegramLayerError } from "../../domain";
import { getCatalog } from "../catalog";
import { makeEnViewContext, makeViewContext } from "../../testing/viewFixtures";
import { NOTICE_KINDS, noticeForErrorCode, noticeForKind } from "./notices";

const ctx = makeViewContext();

describe("noticeForErrorCode", () => {
  it.each([
    ["callback_expired", "expired", "Эта кнопка устарела. Напиши запрос заново, и я подберу время."],
    ["callback_replayed", "already_used", "Это действие уже выполнено."],
    ["callback_not_found", "unavailable", "Эта кнопка недоступна. Попробуй начать заново."],
    ["callback_malformed", "unavailable", "Эта кнопка недоступна. Попробуй начать заново."],
    ["callback_unsupported_version", "unavailable", "Эта кнопка недоступна. Попробуй начать заново."],
    ["callback_unknown_action", "unavailable", "Эта кнопка недоступна. Попробуй начать заново."],
    ["slot_conflict", "slot_conflict", "Это время уже занято. Выбери другое."],
    ["not_found", "not_found", "Не нашёл эту задачу — возможно, она уже удалена."],
    ["transcription_unavailable", "transcription_unavailable", "Не получилось разобрать голосовое. Напиши текстом, пожалуйста."],
    ["intent_parser_unavailable", "intent_parser_unavailable", "Сейчас не могу разобрать сообщение. Попробуй чуть позже."],
    ["invalid_timezone", "invalid_timezone", "Не знаю такого часового пояса. Пример: Europe/Moscow."],
  ] as const)("maps %s to the %s notice", (code, kind, text) => {
    const notice = noticeForErrorCode(code, ctx);

    expect(notice.kind).toBe(kind);
    expect(notice.text).toBe(text);
    expect(notice.message).toEqual({
      kind: "text",
      text,
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: null,
    });
  });

  it.each(["callback_too_long", "render_invalid", "render_too_long", "already_exists", "invalid_argument", "unheard_of", "", "constructor", "toString", "__proto__"])(
    "answers the generic failure for %j",
    (code) => {
      const notice = noticeForErrorCode(code, ctx);

      expect(notice.kind).toBe("failure");
      expect(notice.text).toBe("Что-то пошло не так, попробуйте ещё раз.");
    },
  );

  it("maps the codes of the real error classes", () => {
    const errors: Array<[TelegramLayerError, string]> = [
      [new CallbackExpiredError(), "expired"],
      [new CallbackReplayedError(), "already_used"],
      [new CallbackMalformedError(), "unavailable"],
      [new CallbackVersionError(), "unavailable"],
      [new CallbackUnknownActionError(), "unavailable"],
      [new CallbackTooLongError(), "failure"],
      [new SlotConflictError("x"), "slot_conflict"],
      [new NotFoundError("x"), "not_found"],
      [new InvalidTimezoneError("x"), "invalid_timezone"],
    ];

    for (const [error, kind] of errors) expect(noticeForErrorCode(error.code, ctx).kind).toBe(kind);
  });

  it("answers a forged, unknown or foreign button with one and the same notice", () => {
    const reasons: CallbackNotFoundReason[] = ["unknown_token", "action_mismatch", "owner_mismatch", "chat_mismatch"];
    const notices = reasons.map((reason) => noticeForErrorCode(new CallbackNotFoundError(reason).code, ctx));

    expect(new Set(notices.map((notice) => notice.text)).size).toBe(1);
    expect(notices[0]?.kind).toBe("unavailable");
  });
});

describe("noticeForKind", () => {
  it("has the unsupported-in-this-chat notice", () => {
    expect(noticeForKind("unsupported_chat", ctx).text).toBe("В этом чате так не получится. Напиши мне в личные сообщения.");
  });

  it("speaks English", () => {
    expect(noticeForKind("expired", makeEnViewContext()).text).toBe(
      "This button has expired. Send your request again and I will find a time.",
    );
  });
});

describe("every notice", () => {
  it("fits an answerCallbackQuery alert (200 characters), reveals no ownership and is never empty", () => {
    for (const locale of ["ru", "en"] as const) {
      const localCtx = makeViewContext({ catalog: getCatalog(locale) });
      for (const kind of NOTICE_KINDS) {
        const { text } = noticeForKind(kind, localCtx);

        expect(text.length, `${locale} ${kind}`).toBeLessThanOrEqual(200);
        expect(text.trim(), `${locale} ${kind}`).not.toBe("");
        expect(text, `${locale} ${kind}`).not.toMatch(/owner|mismatch|чужой|владел|не твоя|не твой/i);
      }
    }
  });
});
