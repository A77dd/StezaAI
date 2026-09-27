import { Composer } from "grammy";
import type { BotContext } from "../../bot";
import { registerCommands } from "./commands";
import { registerDataCallbacks } from "./dataCallbacks";
import { registerForwarded } from "./forwarded";
import { registerIntentCallbacks } from "./intentCallbacks";
import { registerPrivateText } from "./privateText";
import { registerSettingsCallbacks } from "./settingsCallbacks";
import { registerSlotCallbacks } from "./slotCallbacks";
import { registerTaskEditCallback } from "./taskEditFlow";
import { registerVoice } from "./voice";
import { registerWelcomeCallbacks } from "./welcomeCallbacks";

/**
 * The personal task flow (ADR 0002 scenario A / Task 7): `/start`, `/help`,
 * `/settings`, `/export`, `/deleteme`, free-text tasks with slot confirmation,
 * and every callback they produce. Scoped to `PERSONAL` chats only (private
 * chats, and updates with no chat) — groups are Task 9's `handlers/group.ts`.
 *
 * Commands are registered before the generic text handler so a recognized
 * command consumes the update before it ever reaches `privateText`.
 */
export function registerPersonalFlow(): Composer<BotContext> {
  const personal = new Composer<BotContext>();
  const scoped = personal.filter((ctx): ctx is BotContext => ctx.chatContext === "PERSONAL");

  registerForwarded(scoped);
  registerVoice(scoped);
  registerCommands(scoped);
  registerPrivateText(scoped);
  registerSlotCallbacks(scoped);
  registerTaskEditCallback(scoped);
  registerIntentCallbacks(scoped);
  registerSettingsCallbacks(scoped);
  registerDataCallbacks(scoped);
  registerWelcomeCallbacks(scoped);

  return personal;
}
