import { describe, expect, expectTypeOf, it } from "vitest";
import { actionButton } from "./buttons";
import { MessageTooLongError, RenderError } from "./errors";
import { b, code, link, quote, text, timeTag } from "./html";
import { keyboard, row } from "./keyboard";
import type { MessageView } from "./messageView";
import { renderMessage } from "./renderMessage";
import { TEXT_LIMIT } from "./limits";

const pick = actionButton("Поставить", "slot.pick", { taskId: "t1", slotIndex: 0 }, "primary");

describe("renderMessage", () => {
  it("renders a full card in a fixed order", () => {
    const rendered = renderMessage({
      title: text("Новая задача"),
      facts: [
        { label: text("Срок"), value: text("завтра") },
        { label: text("Длительность"), value: text("2 ч") },
      ],
      body: text("Подготовить презентацию & отправить"),
      details: {
        summary: text("Исходное сообщение"),
        content: text("Нужно до пятницы <срочно>"),
        expandable: true,
      },
      footer: text("Можно изменить позже"),
      keyboard: keyboard(row(pick)),
    });

    expect(rendered).toEqual({
      kind: "text",
      text:
        "<b>Новая задача</b>\n" +
        "\n" +
        "<b>Срок</b>: завтра\n" +
        "<b>Длительность</b>: 2 ч\n" +
        "\n" +
        "Подготовить презентацию &amp; отправить\n" +
        "\n" +
        "<blockquote expandable><b>Исходное сообщение</b>\n" +
        "Нужно до пятницы &lt;срочно&gt;</blockquote>\n" +
        "\n" +
        "<i>Можно изменить позже</i>",
      parseMode: "HTML",
      linkPreview: "disabled",
      keyboard: [[pick]],
    });
  });

  it("renders only a title", () => {
    expect(renderMessage({ title: text("Готово") }).text).toBe("<b>Готово</b>");
  });

  it("renders only a body", () => {
    expect(renderMessage({ body: text("Просто текст") }).text).toBe("Просто текст");
  });

  it("renders facts as label: value lines with a bold label", () => {
    const { text: rendered } = renderMessage({
      facts: [
        { label: text("Когда"), value: b(text("пт")) },
        { label: text("Где"), value: link(text("Zoom"), "https://example.com/j?a=1&b=2") },
      ],
    });

    expect(rendered).toBe(
      '<b>Когда</b>: <b>пт</b>\n<b>Где</b>: <a href="https://example.com/j?a=1&amp;b=2">Zoom</a>',
    );
  });

  it("renders details as a plain blockquote when not expandable", () => {
    const { text: rendered } = renderMessage({
      details: { summary: text("Детали"), content: text("Текст"), expandable: false },
    });

    expect(rendered).toBe("<blockquote><b>Детали</b>\nТекст</blockquote>");
  });

  it("renders a muted footer in italics", () => {
    expect(renderMessage({ footer: text("подвал") }).text).toBe("<i>подвал</i>");
  });

  it("keeps the same order whatever the order of keys in the view", () => {
    const first = renderMessage({ footer: text("f"), body: text("b"), title: text("t") });
    const second = renderMessage({ title: text("t"), body: text("b"), footer: text("f") });

    expect(first).toEqual(second);
    expect(first.text).toBe("<b>t</b>\n\nb\n\n<i>f</i>");
  });

  it("treats empty title, body, footer and facts as absent", () => {
    const rendered = renderMessage({
      title: text(""),
      facts: [],
      body: text("тело"),
      footer: text(""),
    });

    expect(rendered.text).toBe("тело");
  });

  it("always uses HTML parse mode and disables link previews", () => {
    const rendered = renderMessage({ body: text("https://example.com/") });

    expect(rendered.parseMode).toBe("HTML");
    expect(rendered.linkPreview).toBe("disabled");
  });

  it("has no keyboard unless the view has one", () => {
    expect(renderMessage({ body: text("x") }).keyboard).toBeNull();
  });

  it("does not add an effect: effects are chosen later, per chat type", () => {
    expect("effectId" in renderMessage({ body: text("x") })).toBe(false);
  });

  it("is deterministic and leaves the view untouched", () => {
    const view: MessageView = {
      title: text("t"),
      facts: [{ label: text("a"), value: text("b") }],
      keyboard: keyboard(row(pick)),
    };
    const snapshot = structuredClone(view);

    expect(renderMessage(view)).toEqual(renderMessage(view));
    expect(view).toEqual(snapshot);
  });

  it("renders time tags produced by the builders", () => {
    const { text: rendered } = renderMessage({
      body: b(timeTag(1_790_000_000, "wDt", "пт, 15:00")),
    });

    expect(rendered).toBe('<b><tg-time unix="1790000000" format="wDt">пт, 15:00</tg-time></b>');
  });

  it("allows code in the body", () => {
    expect(renderMessage({ body: code("id=1") }).text).toBe("<code>id=1</code>");
  });
});

describe("renderMessage validation", () => {
  it("rejects an empty view instead of sending an empty message", () => {
    expect(() => renderMessage({})).toThrow(RenderError);
    expect(() => renderMessage({ title: text(""), facts: [] })).toThrow(RenderError);
  });

  it("accepts exactly the text limit and rejects one over, without truncating", () => {
    const atLimit = renderMessage({ body: text("x".repeat(TEXT_LIMIT)) });

    expect(atLimit.text).toHaveLength(TEXT_LIMIT);
    expect(() => renderMessage({ body: text("x".repeat(TEXT_LIMIT + 1)) })).toThrow(
      expect.objectContaining({ code: "render_too_long", limit: TEXT_LIMIT, actual: TEXT_LIMIT + 1 }),
    );
  });

  it("measures visible text: tags and attributes are free, entities count once", () => {
    const body = b(text("&".repeat(4000)));

    expect(renderMessage({ body }).text.length).toBeGreaterThan(TEXT_LIMIT);
  });

  it("counts blank lines and labels toward the limit", () => {
    // title 4000 + "\n\n" + body 95 = 4097
    expect(() =>
      renderMessage({ title: text("t".repeat(4000)), body: text("b".repeat(95)) }),
    ).toThrow(MessageTooLongError);
  });

  it("rejects code in parts the layout wraps in formatting (title, labels, footer)", () => {
    expect(() => renderMessage({ title: code("x") })).toThrow(RenderError);
    expect(() => renderMessage({ facts: [{ label: code("x"), value: text("v") }] })).toThrow(
      RenderError,
    );
    expect(() => renderMessage({ footer: code("x") })).toThrow(RenderError);
  });

  it("rejects a blockquote nested by the layout", () => {
    expect(() =>
      renderMessage({
        details: { summary: text("s"), content: quote(text("inner")), expandable: true },
      }),
    ).toThrow(RenderError);
    expect(() =>
      renderMessage({ facts: [{ label: quote(text("l")), value: text("v") }] }),
    ).toThrow(RenderError);
  });

  it("re-validates a keyboard assembled by hand", () => {
    expect(() => renderMessage({ body: text("x"), keyboard: [] })).toThrow(RenderError);
    expect(() =>
      renderMessage({ body: text("x"), keyboard: [[{ kind: "url", text: "x", url: "http://a.b" }]] }),
    ).toThrow(RenderError);
  });

  it("accepts only branded Html for text parts", () => {
    expectTypeOf<MessageView["title"]>().toEqualTypeOf<ReturnType<typeof text> | undefined>();
    const neverCalled = () => {
      // @ts-expect-error a plain string could carry unescaped markup
      renderMessage({ title: "<b>unsafe" });
      // @ts-expect-error a plain string could carry unescaped markup
      renderMessage({ facts: [{ label: "l", value: text("v") }] });
    };
    expect(neverCalled).toBeTypeOf("function");
  });
});
