import { Api } from "grammy";
import type { Transformer } from "grammy";
import type { Message, Update, UserFromGetMe } from "grammy/types";
import type { Instant } from "../domain";
import { createFakeBotApi } from "./fakeBotApi";
import type { FakeBotApiOptions } from "./fakeBotApi";
import { createMessageIdAllocator } from "./messageIds";
import { DEFAULT_BOT_ID, fakeBotInfo } from "./participants";
import { createTestClock } from "./testClock";
import { createUpdateBuilder } from "./updates";
import type { CallbackOptions } from "./updates/interactionUpdates";

/**
 * The part of a grammY `Bot` the kit needs: it can install an API
 * transformer, holds `botInfo` and handles updates. Written structurally so
 * the kit does not depend on how a later task builds its bot.
 */
export type BotLike = {
  readonly api: {
    readonly config: {
      use(...transformers: Transformer[]): unknown;
      installedTransformers(): readonly unknown[];
    };
  };
  botInfo: UserFromGetMe;
  handleUpdate(update: Update): Promise<void>;
};

export type TelegramTestKitOptions = {
  readonly botUsername?: string;
  readonly botId?: number;
  /** Initial time of the shared clock. */
  readonly startAt?: Instant;
  readonly rateLimits?: FakeBotApiOptions["rateLimits"];
  readonly firstUpdateId?: number;
  /** If true, `sendRichMessage` calls fail (useful for tests that expect the HTML fallback). Default: false. */
  readonly failRichMessages?: boolean;
};

/** Which callback button of a message to press. */
export type ButtonSelector =
  | { readonly text: string; readonly from?: CallbackOptions["from"] }
  | { readonly data: string; readonly from?: CallbackOptions["from"] };

const DEFAULT_USERNAME = "steza_test_bot";

/**
 * The test setup for handler code: a fake Bot API, update builders and one
 * clock, wired together so that an update the builders make is known to the
 * fake before the bot sees it, and message ids never collide.
 *
 * ```ts
 * const kit = createTelegramTestKit();
 * const bot = kit.attach(new Bot(token));
 * await kit.deliver(bot, kit.updates.privateText("hello"));
 * expectCall(kit, "sendMessage", { chat_id: 1001 });
 * ```
 */
export function createTelegramTestKit(options: TelegramTestKitOptions = {}) {
  const botUsername = options.botUsername ?? DEFAULT_USERNAME;
  const botId = options.botId ?? DEFAULT_BOT_ID;
  const clock = createTestClock(options.startAt);
  const messageIds = createMessageIdAllocator();
  const botInfo = fakeBotInfo(botUsername, botId);
  const fake = createFakeBotApi({ clock, messageIds, botInfo, rateLimits: options.rateLimits, failRichMessages: options.failRichMessages });
  const updates = createUpdateBuilder({
    botUsername,
    botId,
    clock,
    messageIds,
    ...(options.firstUpdateId === undefined ? {} : { firstUpdateId: options.firstUpdateId }),
  });

  /** A grammY `Api` that talks to the fake, for code that sends without a bot (workers). */
  const api = new Api("123456:fake-token");
  api.config.use(fake.transformer);

  const findCallbackData = (message: Message, selector: ButtonSelector): string => {
    const buttons = (message.reply_markup?.inline_keyboard ?? []).flat();
    const callbacks = buttons.flatMap((button) =>
      "callback_data" in button ? [{ text: button.text, data: button.callback_data }] : [],
    );
    const found = callbacks.find((button) =>
      "text" in selector ? button.text === selector.text : button.data === selector.data,
    );
    if (found === undefined) {
      const wanted = "text" in selector ? `"${selector.text}"` : `data "${selector.data}"`;
      const available = callbacks.map((button) => `"${button.text}" (${button.data})`).join(", ");
      throw new Error(`press: no callback button ${wanted} on message ${message.message_id}; available: ${available || "none"}`);
    }
    return found.data;
  };

  return {
    fake,
    updates,
    clock,
    botInfo,
    api,

    /**
     * Routes the bot's API calls to the fake and presets `bot.botInfo`, so
     * `getMe` is never called.
     *
     * The fake answers instead of calling the network, so it must be the first
     * (innermost) transformer: plugins installed after it (auto-retry,
     * throttler) wrap it and keep working. A bot that already has transformers
     * is refused, because they would be bypassed silently; hand
     * `kit.fake.transformer` to the code that builds the bot instead.
     */
    attach<T extends BotLike>(bot: T): T {
      if (bot.api.config.installedTransformers().length > 0) {
        throw new Error(
          "attach: the bot already has API transformers, which the fake would bypass; install kit.fake.transformer first (for example through createBot's api option)",
        );
      }
      bot.api.config.use(fake.transformer);
      bot.botInfo = botInfo;
      return bot;
    },

    /** Registers what the update implies in the fake, then lets the bot handle it. */
    async deliver(bot: BotLike, update: Update): Promise<void> {
      fake.observeUpdate(update);
      await bot.handleUpdate(update);
    },

    /**
     * A user presses a callback button of `message`, found by its label or
     * its data; refuses a button the message does not have.
     */
    async press(
      bot: BotLike,
      message: Message,
      selector: ButtonSelector,
    ): Promise<Update & { callback_query: NonNullable<Update["callback_query"]> }> {
      const update = updates.callbackQuery(message, findCallbackData(message, selector), {
        ...(selector.from === undefined ? {} : { from: selector.from }),
      });
      fake.observeUpdate(update);
      await bot.handleUpdate(update);
      return update;
    },

    /** Forgets calls and fake state; the clock, ids and builders keep going. */
    reset(): void {
      fake.reset();
    },
  };
}

export type TelegramTestKit = ReturnType<typeof createTelegramTestKit>;
