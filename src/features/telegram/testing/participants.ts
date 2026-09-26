import type { Chat, User, UserFromGetMe } from "grammy/types";

/** Fake people and chats for tests: synthetic ids only, no real data. */

export type TestUser = User & { readonly is_bot: false };
export type TestPrivateChat = Chat.PrivateChat;
export type TestGroupChat = Chat.GroupChat | Chat.SupergroupChat;

export const DEFAULT_BOT_ID = 900_000_001;

/** What `getMe` returns; preset it as `bot.botInfo` so no network call is made. */
export function fakeBotInfo(username: string, id: number = DEFAULT_BOT_ID): UserFromGetMe {
  return {
    id,
    is_bot: true,
    first_name: "Fake bot",
    username,
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_guest_queries: true,
    supports_inline_queries: true,
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
    can_manage_bots: false,
    supports_join_request_queries: false,
  };
}

export function createTestUser(
  id: number,
  overrides: Partial<Omit<TestUser, "id" | "is_bot">> = {},
): TestUser {
  return { id, is_bot: false, first_name: `User ${id}`, language_code: "ru", ...overrides };
}

export const ALEX: TestUser = createTestUser(1001, { first_name: "Alex", username: "alex_test" });
export const BORIS: TestUser = createTestUser(1002, { first_name: "Boris", username: "boris_test" });

export function privateChatOf(user: User): TestPrivateChat {
  return {
    id: user.id,
    type: "private",
    first_name: user.first_name,
    ...(user.last_name === undefined ? {} : { last_name: user.last_name }),
    ...(user.username === undefined ? {} : { username: user.username }),
  };
}

export function createGroupChat(
  overrides: Partial<Chat.GroupChat> & { readonly id?: number } = {},
): Chat.GroupChat {
  return { id: -5_000_001, type: "group", title: "Test group", ...overrides };
}

export function createSupergroupChat(
  overrides: Partial<Chat.SupergroupChat> & { readonly id?: number } = {},
): Chat.SupergroupChat {
  return { id: -1_001_234_567_890, type: "supergroup", title: "Test supergroup", ...overrides };
}
