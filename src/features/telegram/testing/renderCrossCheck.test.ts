import { describe, expect, it } from "vitest";
import { getCatalog } from "../render/catalog";
import { HOSTILE_TITLE, viewSamples } from "./viewSamples";
import { makeViewContext } from "./viewFixtures";
import { parseTelegramHtml } from "./htmlOracle";
import { readMessageText } from "./validation/text";
import { readRichContent } from "./validation/messages";

/**
 * The oracle is written independently of `render/`; this test feeds it every
 * message the renderer can produce (both locales, user text that is plain,
 * hostile, emoji heavy and very long) and expects the Bot API rules to accept
 * all of it. A disagreement is either a renderer bug or an oracle bug.
 */

const USER_TEXTS: readonly [string, string][] = [
  ["plain", "Подготовить презентацию"],
  ["hostile markup", HOSTILE_TITLE],
  ["emoji", "😀".repeat(150)],
  ["long", "слово ".repeat(400)],
];

describe.each(["ru", "en"] as const)("render output is accepted by the Bot API oracle (%s)", (locale) => {
  const context = makeViewContext({ catalog: getCatalog(locale) });

  describe.each(USER_TEXTS)("user text: %s", (_label, userText) => {
    for (const sample of viewSamples(userText)) {
      it(`${sample.name}`, () => {
        for (const message of sample.render(context)) {
          if (message.kind === "text") {
            const parsed = readMessageText({ text: message.text, parse_mode: message.parseMode });
            expect(parsed.text.trim()).not.toBe("");
          } else {
            expect(() => readRichContent({ markdown: message.markdown })).not.toThrow();
          }
        }
      });
    }
  });
});

describe("the oracle sees the user's text unchanged inside rendered markup", () => {
  it("shows hostile user text as text, never as tags", () => {
    const context = makeViewContext();
    const [sample] = viewSamples(HOSTILE_TITLE).filter((candidate) => candidate.name === "task proposed");
    const message = sample?.render(context)[0];
    if (message === undefined || message.kind !== "text") throw new Error("expected a text message");

    const { text } = parseTelegramHtml(message.text);

    expect(text).toContain("<INJECT>&amp;</a>");
  });
});
