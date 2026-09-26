import { CALLBACK_ACTIONS } from "../callbacks";
import type { Slot } from "../domain";
import { getCatalog } from "../render/catalog";
import { assertValidKeyboard } from "../render/keyboard";
import type { RenderedMessage } from "../render/rendered";
import type { ViewContext } from "../render/views/context";

// Fake data only: shared builders and checks for view tests.

/** Wednesday 2026-09-23, 12:00 in Moscow. */
export const NOW = "2026-09-23T09:00:00.000Z";

export function makeViewContext(overrides: Partial<ViewContext> = {}): ViewContext {
  return {
    catalog: getCatalog("ru"),
    timezone: "Europe/Moscow",
    now: NOW,
    botUsername: "steza_test_bot",
    miniAppUrl: "https://app.example.com/mini",
    ...overrides,
  };
}

export function makeEnViewContext(overrides: Partial<ViewContext> = {}): ViewContext {
  return makeViewContext({ catalog: getCatalog("en"), ...overrides });
}

/** A slot of `minutes` starting at a UTC instant. */
export function slotAt(startUtc: string, minutes = 60): Slot {
  const start = new Date(startUtc);
  return { start: start.toISOString(), end: new Date(start.getTime() + minutes * 60_000).toISOString() };
}

/** Wed 16:00-17:00 Moscow, Thu 10:00-11:00 Moscow, Fri 11:00-12:00 Moscow. */
export const TODAY_SLOT = slotAt("2026-09-23T13:00:00.000Z");
export const TOMORROW_SLOT = slotAt("2026-09-24T07:00:00.000Z");
export const FRIDAY_SLOT = slotAt("2026-09-25T08:00:00.000Z");

/** The keyboard rules every view must meet: Telegram limits, and payloads the callback registry accepts. */
export function expectValidKeyboard(message: RenderedMessage): void {
  if (message.keyboard === null) return;
  assertValidKeyboard(message.keyboard);
  for (const buttons of message.keyboard) {
    for (const button of buttons) {
      if (button.kind !== "action") continue;
      const config = CALLBACK_ACTIONS[button.action];
      if (!config.validate(button.payload)) {
        throw new Error(`Payload of action ${button.action} is rejected by the registry`);
      }
    }
  }
}

/** Every button label of a message, row by row, for compact golden assertions. */
export function labels(message: RenderedMessage): string[][] {
  return (message.keyboard ?? []).map((buttons) => buttons.map((button) => button.text));
}

/** The rendered `slotHtml` of the fixture slots in Moscow time, as literals. */
export const SLOT_HTML = {
  today:
    '<tg-time unix="1790168400" format="wDt">ср, 16:00</tg-time>–<tg-time unix="1790172000" format="t">17:00</tg-time>',
  tomorrow:
    '<tg-time unix="1790233200" format="wDt">чт, 10:00</tg-time>–<tg-time unix="1790236800" format="t">11:00</tg-time>',
  friday:
    '<tg-time unix="1790323200" format="wDt">пт, 11:00</tg-time>–<tg-time unix="1790326800" format="t">12:00</tg-time>',
} as const;
