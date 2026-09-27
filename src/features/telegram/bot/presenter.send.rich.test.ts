import { describe, expect, it } from "vitest";
import { actionButton, keyboard, renderRichMarkdown, row } from "../render";
import { expectCall } from "../testing/assertions";
import { ALEX } from "../testing/participants";
import { createHandlerHarness } from "../testing/pipelineHarness";
import { sendCard } from "./presenter";

const harnessRunning = createHandlerHarness;

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
