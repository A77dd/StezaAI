import { Context } from "grammy";
import type { Api, Context as GrammyContext } from "grammy";
import type { UserFromGetMe, Update } from "grammy/types";
import type { ChatContext, Locale, UserSettings } from "../domain";
import { getCatalog } from "../render";
import type { ViewContext } from "../render";
import type { Logger } from "./logger";
import type { BotServices } from "./services";
import { chatContextOf, chatTypeOf, updateKindOf } from "./updateFacts";
import type { ChatKind } from "./updateFacts";

/**
 * The timezone of a user who has none stored. It matches
 * `createDefaultSettings`: the Bot API gives no timezone and guessing one
 * would schedule at wrong local times, so views that show times ask for
 * settings first; notices and other timeless views can use this.
 */
export const DEFAULT_VIEW_TIMEZONE = "UTC";

/**
 * What the pipeline adds to grammY's `Context`. Everything except `locale`
 * and `log` is fixed when the context is built; `enrichContext` refines those
 * two once the stored settings are known.
 */
export type BotContextFlavor = {
  /** The ports (see `BotServices`). Handlers use nothing else from the outside. */
  readonly services: BotServices;
  /** PERSONAL for private chats (and updates with no chat), CHAT for groups. */
  readonly chatContext: ChatContext;
  /**
   * The language of replies: the stored `settings.locale`, else derived from
   * Telegram's `language_code` (`deriveLocale`). Before `enrichContext` runs
   * it holds the derived value, so the error boundary can always answer.
   */
  locale: Locale;
  /** Update-scoped logger: carries `updateId` (and the update kind after enrichment), never PII. */
  log: Logger;
  /**
   * The current user's stored settings, `null` if they have none (or the
   * update has no user). Read once per update and cached: a handler that
   * changes settings must use the value its write returned, not call this again.
   */
  loadSettings(): Promise<UserSettings | null>;
  /** What views need besides their own data. `null` settings: default timezone. */
  viewContext(settings: UserSettings | null): ViewContext;
};

export type BotContext = GrammyContext & BotContextFlavor;

/**
 * A `Context` subclass bound to `services`, for `Bot`'s `ContextConstructor`
 * option. Doing this at construction (instead of in a middleware) means every
 * middleware, including the outermost ones that run before `enrichContext`,
 * sees a complete context.
 */
export function createBotContextClass(
  services: BotServices,
): new (update: Update, api: Api, me: UserFromGetMe) => BotContext {
  return class ServiceContext extends Context implements BotContextFlavor {
    readonly services = services;
    readonly chatContext: ChatContext;
    locale: Locale;
    log: Logger;
    private settingsRead: Promise<UserSettings | null> | undefined;

    constructor(update: Update, api: Api, me: UserFromGetMe) {
      super(update, api, me);
      this.chatContext = chatContextOf(this.chatKind());
      // Product decision (2026-09-27): the pilot speaks Russian only, whatever
      // the client's `language_code` is. The catalogs stay bilingual, so
      // re-enabling `deriveLocale` is a one-line change here.
      this.locale = "ru";
      this.log = services.logger.child({ updateId: update.update_id });
    }

    /** The chat type, or the inline query's chat type when the update has no chat. */
    private chatKind(): { readonly type: ChatKind } | undefined {
      if (this.chat !== undefined) return this.chat;
      const inlineChatType = this.inlineQuery?.chat_type;
      return inlineChatType === undefined ? undefined : { type: inlineChatType };
    }

    loadSettings(): Promise<UserSettings | null> {
      this.settingsRead ??=
        this.from === undefined
          ? Promise.resolve(null)
          : services.settings.get(String(this.from.id));
      return this.settingsRead;
    }

    viewContext(settings: UserSettings | null): ViewContext {
      return {
        catalog: getCatalog(this.locale),
        timezone: settings?.timezone ?? DEFAULT_VIEW_TIMEZONE,
        now: services.clock.now(),
        botUsername: services.config.botUsername,
        miniAppUrl: services.config.miniAppUrl ?? null,
      };
    }
  };
}

/** Log bindings that describe an update without identifying anyone. */
export function updateLogBindings(ctx: GrammyContext): { updateKind: string; chatType: string } {
  return { updateKind: updateKindOf(ctx.update), chatType: chatTypeOf(ctx) };
}
