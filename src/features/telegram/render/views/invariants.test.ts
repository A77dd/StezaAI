import { describe, expect, it } from "vitest";
import {
  HOSTILE_TITLE,
  INJECTION,
  viewSamples,
} from "../../testing/viewSamples";
import { expectValidKeyboard, makeEnViewContext, makeViewContext } from "../../testing/viewFixtures";
import { RICH_LIMIT, TEXT_LIMIT, visibleLength } from "../limits";
import type { Html } from "../htmlType";

const contexts = [
  ["ru", makeViewContext()],
  ["en", makeEnViewContext()],
] as const;

describe.each(contexts)("every view (%s)", (_locale, ctx) => {
  const ordinary = viewSamples("Подготовить презентацию");
  const hostile = viewSamples(HOSTILE_TITLE);

  it.each(ordinary.map((sample) => [sample.name, sample] as const))(
    "%s: has a valid keyboard whose payloads the callback registry accepts",
    (_name, sample) => {
      for (const message of sample.render(ctx)) expectValidKeyboard(message);
    },
  );

  it.each(hostile.map((sample) => [sample.name, sample] as const))(
    "%s: stays within Telegram's limits with a 200-character hostile title and three slots",
    (_name, sample) => {
      for (const message of sample.render(ctx)) {
        if (message.kind === "text") expect(visibleLength(message.text as Html)).toBeLessThanOrEqual(TEXT_LIMIT);
        else expect(message.markdown.length).toBeLessThanOrEqual(RICH_LIMIT);
        expectValidKeyboard(message);
      }
    },
  );

  it.each(hostile.map((sample) => [sample.name, sample] as const))(
    "%s: escapes user text and never puts it on a button",
    (_name, sample) => {
      for (const message of sample.render(ctx)) {
        const body = message.kind === "text" ? message.text : message.markdown;

        expect(body).not.toContain("<INJECT>");
        expect(body).not.toContain("</a>");
        expect(body).not.toContain("&amp;</");
        for (const button of message.keyboard?.flat() ?? []) {
          expect(button.text).not.toContain("INJECT");
          if (button.kind === "copy_text") expect(button.copyText).not.toContain("INJECT");
        }
      }
    },
  );

  it("sanity: the injection marker is what the tests assume", () => {
    expect(INJECTION).toBe("<INJECT>&amp;</a>");
    expect(HOSTILE_TITLE.length).toBeGreaterThan(200);
  });
});
