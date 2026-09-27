import { actionButton } from "../buttons";
import { text } from "../html";
import { keyboard } from "../keyboard";
import type { RenderedMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import type { ViewContext } from "./context";
import { chunkRows } from "./shared";

/**
 * Common timezones offered as a shortcut on the timezone prompt. IANA names
 * are not translated: the same buttons appear in every locale.
 */
const TIMEZONE_PRESETS = ["Europe/Moscow", "Europe/Kyiv", "Asia/Almaty", "UTC"] as const;
const PRESETS_PER_ROW = 2;

export type AskInputInput =
  | { readonly kind: "timezone" }
  | { readonly kind: "task_edit" }
  | { readonly kind: "working_hours" };

/**
 * Prompts for a free-text answer the personal-flow handlers expect back
 * (Task 7): a timezone (with a few one-tap presets), a task correction, or new
 * working hours. Handlers save a `PendingInput` keyed to the sent message so
 * the next plain-text message from the user is routed here instead of being
 * treated as a new task (see `handlers/personal/pendingInput.ts`).
 */
export function askInputView(input: AskInputInput, ctx: ViewContext): RenderedMessage {
  const { personal } = ctx.catalog;
  switch (input.kind) {
    case "timezone": {
      const buttons = TIMEZONE_PRESETS.map((tz) => actionButton(tz, "settings.timezone", { tz }));
      return renderMessage({
        body: text(personal.askTimezone),
        keyboard: keyboard(...chunkRows(buttons, PRESETS_PER_ROW)),
      });
    }
    case "task_edit":
      return renderMessage({ body: text(personal.askTaskEdit) });
    case "working_hours":
      return renderMessage({ body: text(personal.askWorkingHours) });
  }
}
