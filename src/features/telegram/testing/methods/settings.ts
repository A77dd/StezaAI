import type { ChatAdministratorRights, WebhookInfo } from "grammy/types";
import {
  readChatMenuButton,
  readCommandsKey,
  readDefaultAdministratorRights,
  readLanguageCode,
  readProfileText,
  readSetMyCommands,
} from "../validation/profile";
import { readSetWebhook } from "../validation/webhook";
import { optionalBoolean } from "../validation/guards";
import { readPrivateChatId } from "../validation/chat";
import type { MethodHandler } from "./context";

const NAME_MAX = 64;
const DESCRIPTION_MAX = 512;
const SHORT_DESCRIPTION_MAX = 120;

export const getMe: MethodHandler = ({ state }) => state.botInfo;

export const setWebhook: MethodHandler = ({ state }, payload) => {
  const request = readSetWebhook(payload);
  if (request.url === "") {
    state.profile.removeWebhook();
    return true;
  }
  state.profile.setWebhook({
    url: request.url,
    secretToken: request.secretToken,
    allowedUpdates: request.allowedUpdates,
    maxConnections: request.maxConnections,
    ipAddress: typeof payload.ip_address === "string" ? payload.ip_address : undefined,
  });
  return true;
};

export const deleteWebhook: MethodHandler = ({ state }, payload) => {
  optionalBoolean(payload, "drop_pending_updates");
  state.profile.removeWebhook();
  return true;
};

export const getWebhookInfo: MethodHandler = ({ state }): WebhookInfo => {
  const webhook = state.profile.webhook();
  return {
    url: webhook.url,
    has_custom_certificate: false,
    pending_update_count: 0,
    ...(webhook.ipAddress === undefined ? {} : { ip_address: webhook.ipAddress }),
    ...(webhook.maxConnections === undefined ? {} : { max_connections: webhook.maxConnections }),
    ...(webhook.allowedUpdates === undefined ? {} : { allowed_updates: [...webhook.allowedUpdates] }),
  };
};

export const setMyCommands: MethodHandler = ({ state }, payload) => {
  const request = readSetMyCommands(payload);
  state.profile.setCommands(request.scopeKey, request.languageCode, request.commands);
  return true;
};

export const getMyCommands: MethodHandler = ({ state }, payload) => {
  const key = readCommandsKey(payload);
  return state.profile.commandsFor(key.scopeKey, key.languageCode);
};

export const deleteMyCommands: MethodHandler = ({ state }, payload) => {
  const key = readCommandsKey(payload);
  state.profile.deleteCommands(key.scopeKey, key.languageCode);
  return true;
};

export const setMyName: MethodHandler = ({ state }, payload) => {
  const { value, languageCode } = readProfileText(payload, { field: "name", maximum: NAME_MAX });
  state.profile.setName(languageCode, value);
  return true;
};

export const getMyName: MethodHandler = ({ state }, payload) => ({
  name: state.profile.name(readLanguageCode(payload), state.botInfo.first_name),
});

export const setMyDescription: MethodHandler = ({ state }, payload) => {
  const { value, languageCode } = readProfileText(payload, { field: "description", maximum: DESCRIPTION_MAX });
  state.profile.setDescription(languageCode, value);
  return true;
};

export const getMyDescription: MethodHandler = ({ state }, payload) => ({
  description: state.profile.description(readLanguageCode(payload)),
});

export const setMyShortDescription: MethodHandler = ({ state }, payload) => {
  const { value, languageCode } = readProfileText(payload, {
    field: "short_description",
    maximum: SHORT_DESCRIPTION_MAX,
  });
  state.profile.setShortDescription(languageCode, value);
  return true;
};

export const getMyShortDescription: MethodHandler = ({ state }, payload) => ({
  short_description: state.profile.shortDescription(readLanguageCode(payload)),
});

export const setChatMenuButton: MethodHandler = ({ state }, payload) => {
  const { chatId, button } = readChatMenuButton(payload);
  state.profile.setMenuButton(chatId, button);
  return true;
};

export const getChatMenuButton: MethodHandler = ({ state }, payload) =>
  state.profile.menuButton(payload.chat_id === undefined ? undefined : readPrivateChatId(payload));

export const setMyDefaultAdministratorRights: MethodHandler = ({ state }, payload) => {
  const { rights, forChannels } = readDefaultAdministratorRights(payload);
  state.profile.setRights(forChannels, rights);
  return true;
};

/** Every right is reported, `false` unless it was set. */
export const getMyDefaultAdministratorRights: MethodHandler = ({ state }, payload): ChatAdministratorRights => {
  const set = state.profile.rights(optionalBoolean(payload, "for_channels") ?? false) ?? {};
  return {
    is_anonymous: set.is_anonymous ?? false,
    can_manage_chat: set.can_manage_chat ?? false,
    can_delete_messages: set.can_delete_messages ?? false,
    can_manage_video_chats: set.can_manage_video_chats ?? false,
    can_restrict_members: set.can_restrict_members ?? false,
    can_promote_members: set.can_promote_members ?? false,
    can_change_info: set.can_change_info ?? false,
    can_invite_users: set.can_invite_users ?? false,
    can_manage_tags: set.can_manage_tags ?? false,
    can_post_stories: set.can_post_stories ?? false,
    can_edit_stories: set.can_edit_stories ?? false,
    can_delete_stories: set.can_delete_stories ?? false,
    can_post_messages: set.can_post_messages ?? false,
    can_edit_messages: set.can_edit_messages ?? false,
    can_pin_messages: set.can_pin_messages ?? false,
    can_manage_topics: set.can_manage_topics ?? false,
    can_manage_direct_messages: set.can_manage_direct_messages ?? false,
    can_send_welcome_messages: set.can_send_welcome_messages ?? false,
  };
};
