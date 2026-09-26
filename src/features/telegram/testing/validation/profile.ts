import type {
  BotCommand,
  ChatAdministratorRights,
  MenuButton,
} from "grammy/types";
import { readChatTarget, readPrivateChatId } from "./chat";
import {
  characterCount,
  isRecord,
  optionalBoolean,
  optionalString,
  requireInteger,
  requireRecord,
} from "./guards";
import type { Payload } from "./guards";
import { badRequest } from "./rejection";

/**
 * Bot profile settings (research 5.7): `setMyCommands` (at most 100 commands,
 * `[a-z0-9_]{1,32}`, description 1-256, scope and language), name (0-64),
 * description (0-512), short description (0-120), menu button and default
 * administrator rights.
 *
 * UNVERIFIED: BOT_COMMAND_INVALID and BOT_COMMAND_DESCRIPTION_INVALID are what
 * the real API is known to answer; the other descriptions are generic wording.
 * UNVERIFIED: language codes are only checked for the `[a-z]{2}` shape, not
 * against the ISO 639-1 list; duplicate command names are accepted; the text
 * length limits count characters (code points).
 */

export const COMMANDS_MAX = 100;
const COMMAND_NAME = /^[a-z0-9_]{1,32}$/;
const DESCRIPTION_MAX = 256;
const LANGUAGE_CODE = /^(?:[a-z]{2})?$/;
const MENU_TEXT_MAX = 64;

export function readLanguageCode(payload: Payload): string {
  const code = optionalString(payload, "language_code") ?? "";
  if (!LANGUAGE_CODE.test(code)) throw badRequest("language code is invalid");
  return code;
}

const SCOPES_WITHOUT_CHAT: readonly unknown[] = [
  "default",
  "all_private_chats",
  "all_group_chats",
  "all_chat_administrators",
];

/** Reads a `BotCommandScope` into a stable key such as `chat_member:-100:5`. */
export function readCommandScope(value: unknown): string {
  if (value === undefined) return "default";
  const scope = requireRecord(value, "scope");
  const type = scope.type;
  if (SCOPES_WITHOUT_CHAT.includes(type)) return type as string;
  if (type === "chat" || type === "chat_administrators") {
    return `${type}:${readChatTarget(scope).id}`;
  }
  if (type === "chat_member") {
    const chat = readChatTarget(scope);
    return `chat_member:${chat.id}:${requireInteger(scope, "user_id", 1, "user_id is required for chat_member scope")}`;
  }
  throw badRequest("unsupported bot command scope type");
}

export type CommandsKey = { readonly scopeKey: string; readonly languageCode: string };

export function readCommandsKey(payload: Payload): CommandsKey {
  return { scopeKey: readCommandScope(payload.scope), languageCode: readLanguageCode(payload) };
}

function readCommand(value: unknown): BotCommand {
  if (!isRecord(value)) throw badRequest("commands must be an array of BotCommand objects");
  const { command, description } = value;
  if (typeof command !== "string" || !COMMAND_NAME.test(command)) throw badRequest("BOT_COMMAND_INVALID");
  if (typeof description !== "string" || description === "" || characterCount(description) > DESCRIPTION_MAX) {
    throw badRequest("BOT_COMMAND_DESCRIPTION_INVALID");
  }
  const isEphemeral = optionalBoolean(value, "is_ephemeral");
  return isEphemeral === undefined ? { command, description } : { command, description, is_ephemeral: isEphemeral };
}

export type SetCommandsRequest = CommandsKey & { readonly commands: readonly BotCommand[] };

export function readSetMyCommands(payload: Payload): SetCommandsRequest {
  const raw = payload.commands;
  if (!Array.isArray(raw)) throw badRequest("commands must be an array");
  if (raw.length > COMMANDS_MAX) throw badRequest("too many commands specified");
  return { ...readCommandsKey(payload), commands: (raw as unknown[]).map(readCommand) };
}

/** `name` / `description` / `short_description` with their `language_code`. */
export function readProfileText(
  payload: Payload,
  rules: { readonly field: "name" | "description" | "short_description"; readonly maximum: number },
): { readonly value: string; readonly languageCode: string } {
  const value = optionalString(payload, rules.field) ?? "";
  if (characterCount(value) > rules.maximum) throw badRequest(`${rules.field} is too long`);
  return { value, languageCode: readLanguageCode(payload) };
}

function assertHttpsWebApp(value: unknown): { url: string } {
  const webApp = requireRecord(value, "web_app");
  if (typeof webApp.url !== "string" || !URL.canParse(webApp.url) || new URL(webApp.url).protocol !== "https:") {
    throw badRequest("BUTTON_URL_INVALID");
  }
  return { url: webApp.url };
}

/**
 * `setChatMenuButton`: `commands`, `default` or a `web_app` button with text
 * and an https URL, for the default menu or one private chat.
 * UNVERIFIED: the web_app button text is required to be 1-64 characters.
 */
export function readChatMenuButton(payload: Payload): {
  readonly chatId: number | undefined;
  readonly button: MenuButton;
} {
  const chatId = payload.chat_id === undefined ? undefined : readPrivateChatId(payload);
  if (payload.menu_button === undefined) return { chatId, button: { type: "default" } };
  const button = requireRecord(payload.menu_button, "menu_button");
  switch (button.type) {
    case "commands":
      return { chatId, button: { type: "commands" } };
    case "default":
      return { chatId, button: { type: "default" } };
    case "web_app": {
      if (typeof button.text !== "string" || button.text === "" || characterCount(button.text) > MENU_TEXT_MAX) {
        throw badRequest("menu button text must be 1-64 characters");
      }
      return { chatId, button: { type: "web_app", text: button.text, web_app: assertHttpsWebApp(button.web_app) } };
    }
    default:
      throw badRequest("unsupported menu button type");
  }
}

// A Record over the keys fails to compile when the Bot API adds a right.
const RIGHTS: Readonly<Record<keyof ChatAdministratorRights, true>> = {
  is_anonymous: true,
  can_manage_chat: true,
  can_delete_messages: true,
  can_manage_video_chats: true,
  can_restrict_members: true,
  can_promote_members: true,
  can_change_info: true,
  can_invite_users: true,
  can_manage_tags: true,
  can_post_stories: true,
  can_edit_stories: true,
  can_delete_stories: true,
  can_post_messages: true,
  can_edit_messages: true,
  can_pin_messages: true,
  can_manage_topics: true,
  can_manage_direct_messages: true,
  can_send_welcome_messages: true,
};

export type RightsRequest = {
  readonly rights: Partial<ChatAdministratorRights> | undefined;
  readonly forChannels: boolean;
};

/** UNVERIFIED: rights are not required to be complete; unknown right names are rejected. */
export function readDefaultAdministratorRights(payload: Payload): RightsRequest {
  const forChannels = optionalBoolean(payload, "for_channels") ?? false;
  if (payload.rights === undefined) return { rights: undefined, forChannels };
  const raw = requireRecord(payload.rights, "rights");
  const rights: Partial<Record<keyof ChatAdministratorRights, boolean>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!Object.hasOwn(RIGHTS, key) || typeof value !== "boolean") {
      throw badRequest(`rights.${key} is not a valid administrator right`);
    }
    rights[key as keyof ChatAdministratorRights] = value;
  }
  return { rights, forChannels };
}
