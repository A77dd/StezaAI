import type { Chat, User, UserFromGetMe } from "grammy/types";
import type { Clock } from "../../domain";
import { parseInstant } from "../../domain";
import type { MessageIdAllocator } from "../messageIds";
import type { ChatTarget } from "../validation/chat";
import { createBotProfile } from "./botProfile";
import { createChatAccess } from "./chatAccess";
import { createDraftStore } from "./draftStore";
import { createEphemeralStore } from "./ephemeralStore";
import { createFileRegistry } from "./fileRegistry";
import { createMessageStore } from "./messageStore";
import { createQueryStore } from "./queryStore";
import { createRateLimiter } from "./rateLimiter";
import type { RateLimitOptions } from "./rateLimiter";

export type FakeStateOptions = {
  readonly clock: { current: Clock };
  readonly botInfo: UserFromGetMe;
  readonly messageIds: MessageIdAllocator;
  /** `undefined`: no flood control. */
  readonly rateLimits: RateLimitOptions | undefined;
};

/** Everything the fake Bot API remembers between calls. */
export function createFakeState(options: FakeStateOptions) {
  const messages = createMessageStore();
  const queries = createQueryStore();
  const files = createFileRegistry();
  const drafts = createDraftStore();
  const ephemeral = createEphemeralStore();
  const access = createChatAccess();
  const profile = createBotProfile();
  const rateLimiter = options.rateLimits === undefined ? undefined : createRateLimiter(options.rateLimits);
  const usernameChats = new Map<string, Chat>();

  const nowMs = (): number => parseInstant(options.clock.current.now());

  const chatById = (id: number): Chat => {
    const known = messages.chat(id);
    if (known !== undefined) return known;
    if (id > 0) return { id, type: "private", first_name: `User ${id}` };
    // Supergroup and channel ids look like -100xxxxxxxxxx.
    if (id < -1_000_000_000_000) return { id, type: "supergroup", title: "Test supergroup" };
    return { id, type: "group", title: "Test group" };
  };

  const botUser: User = {
    id: options.botInfo.id,
    is_bot: true,
    first_name: options.botInfo.first_name,
    username: options.botInfo.username,
  };

  return {
    botInfo: options.botInfo,
    botUser,
    messageIds: options.messageIds,
    messages,
    queries,
    files,
    drafts,
    ephemeral,
    access,
    profile,
    rateLimiter,
    nowMs,
    nowSeconds: (): number => Math.floor(nowMs() / 1000),
    chatById,
    /**
     * The chat a send targets. `@username` targets become channels with a
     * synthetic id, stable for the life of the fake.
     */
    resolveChat(target: ChatTarget): Chat {
      if (typeof target.id === "number") return chatById(target.id);
      const known = usernameChats.get(target.id);
      if (known !== undefined) return known;
      const chat: Chat = {
        id: -1_000_000_000_000 - (usernameChats.size + 1),
        type: "channel",
        title: target.id,
        username: target.id.slice(1),
      };
      usernameChats.set(target.id, chat);
      return chat;
    },
    /** Resolves the numeric id of a chat id or `@username` in a payload. */
    numericChatId(id: number | string): number | undefined {
      if (typeof id === "number") return id;
      return usernameChats.get(id)?.id;
    },
    reset(): void {
      messages.clear();
      queries.clear();
      files.clear();
      drafts.clear();
      ephemeral.clear();
      access.clear();
      profile.clear();
      rateLimiter?.clear();
      usernameChats.clear();
    },
  };
}

export type FakeState = ReturnType<typeof createFakeState>;
