import type { User } from "grammy/types";
import type { RecordedCall } from "./fakeBotApi";
import type { PipelineHarness } from "./pipelineHarness";

/**
 * Helpers for the Rich calendar flow: the proposal card is a Rich Message
 * whose buttons live inside the HTML body, not in `reply_markup`, so
 * `kit.press` does not apply. These helpers parse the bound `data` attributes
 * back out of the recorded rich html and deliver presses as raw callback
 * queries — exactly what a real client would send.
 */

export type RichButton = { readonly label: string; readonly data: string };

const BUTTON_PATTERN = /<tg-button type="callback_data"(?: style="[^"]*")? data="([^"]+)">([^<]*)<\/tg-button>/g;

/** The (label, data) pairs of every live callback button in a rich call. */
export function richButtons(call: RecordedCall): RichButton[] {
  const payload = call.payload as { rich_message?: { html?: string } };
  const html = payload.rich_message?.html ?? "";
  const buttons: RichButton[] = [];
  for (const match of html.matchAll(BUTTON_PATTERN)) {
    buttons.push({ data: match[1]!, label: match[2]! });
  }
  return buttons;
}

/** The plain text of a rich message (tags stripped), for `toContain` assertions. */
export function richText(call: RecordedCall): string {
  const payload = call.payload as { rich_message?: { html?: string } };
  return (payload.rich_message?.html ?? "")
    .replace(/<tg-button[^>]*>|<\/tg-button>|<tg-button-row[^>]*>|<\/tg-button-row>/g, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&");
}

/** The latest rich call in a chat (a send or an edit): the current card. */
export function lastRichCall(h: PipelineHarness, chatId: number): RecordedCall {
  const candidates = [...h.kit.fake.callsTo("sendRichMessage"), ...h.kit.fake.callsTo("editMessageText")];
  const found = candidates.findLast((call) => call.payload.chat_id === chatId);
  if (found === undefined) throw new Error(`no rich call to chat ${chatId}`);
  return found;
}

/**
 * Presses an in-body button of the current rich card in `chatId`: finds its
 * bound data by visible label (string equality or a regular expression) and
 * delivers a raw callback query the way a real client does.
 */
export async function pressRich(
  h: PipelineHarness,
  chatId: number,
  selector: string | RegExp,
  from?: User,
): Promise<void> {
  const button = richButtons(lastRichCall(h, chatId)).find((candidate) =>
    typeof selector === "string" ? candidate.label === selector : selector.test(candidate.label),
  );
  if (button === undefined) {
    const available = richButtons(lastRichCall(h, chatId)).map((b) => `"${b.label}"`).join(", ");
    throw new Error(`no rich button matches ${String(selector)}; available: ${available || "none"}`);
  }
  const card = h.kit.fake.messages.last(chatId)!.message;
  await h.deliver(h.kit.updates.callbackQuery(card, button.data, from === undefined ? {} : { from }));
}
