import type { BotCommand, ChatAdministratorRights, MenuButton } from "grammy/types";
import type { UpdateType } from "../validation/webhook";

export type WebhookState = {
  readonly url: string;
  readonly secretToken: string | undefined;
  readonly allowedUpdates: readonly UpdateType[] | undefined;
  readonly maxConnections: number | undefined;
  readonly ipAddress: string | undefined;
};

const NO_WEBHOOK: WebhookState = {
  url: "",
  secretToken: undefined,
  allowedUpdates: undefined,
  maxConnections: undefined,
  ipAddress: undefined,
};

export type AdminRightsSetting = Partial<ChatAdministratorRights>;

const key = (scopeKey: string, languageCode: string): string => `${scopeKey}|${languageCode}`;

/**
 * Bot settings the setup script writes (Task 12): command lists per scope and
 * language, profile texts per language, menu buttons, default administrator
 * rights and the webhook. Read-only views let tests assert what was set.
 */
export function createBotProfile() {
  const commands = new Map<string, readonly BotCommand[]>();
  const names = new Map<string, string>();
  const descriptions = new Map<string, string>();
  const shortDescriptions = new Map<string, string>();
  const menuButtons = new Map<string, MenuButton>();
  const rights = new Map<boolean, AdminRightsSetting>();
  let webhook: WebhookState = NO_WEBHOOK;

  const setText = (map: Map<string, string>, languageCode: string, value: string): void => {
    // An empty value removes the dedicated text for the language (Bot API).
    if (value === "" && languageCode !== "") map.delete(languageCode);
    else map.set(languageCode, value);
  };

  return {
    setCommands(scopeKey: string, languageCode: string, list: readonly BotCommand[]): void {
      commands.set(key(scopeKey, languageCode), list);
    },
    commandsFor(scopeKey: string, languageCode: string): readonly BotCommand[] {
      return commands.get(key(scopeKey, languageCode)) ?? [];
    },
    deleteCommands(scopeKey: string, languageCode: string): void {
      commands.delete(key(scopeKey, languageCode));
    },
    /** Every stored command list, keyed `scope|language`. */
    allCommands(): ReadonlyMap<string, readonly BotCommand[]> {
      return commands;
    },
    setName: (languageCode: string, value: string): void => setText(names, languageCode, value),
    setDescription: (languageCode: string, value: string): void => setText(descriptions, languageCode, value),
    setShortDescription: (languageCode: string, value: string): void =>
      setText(shortDescriptions, languageCode, value),
    /** The text for a language, else the one for all languages, else `fallback`. */
    name: (languageCode: string, fallback: string): string =>
      names.get(languageCode) ?? names.get("") ?? fallback,
    description: (languageCode: string): string => descriptions.get(languageCode) ?? descriptions.get("") ?? "",
    shortDescription: (languageCode: string): string =>
      shortDescriptions.get(languageCode) ?? shortDescriptions.get("") ?? "",
    /** Profile texts as set, keyed by language (`""` for all languages). */
    allNames: (): ReadonlyMap<string, string> => names,
    allDescriptions: (): ReadonlyMap<string, string> => descriptions,
    allShortDescriptions: (): ReadonlyMap<string, string> => shortDescriptions,
    setMenuButton(chatId: number | undefined, button: MenuButton): void {
      menuButtons.set(chatId === undefined ? "default" : String(chatId), button);
    },
    menuButton(chatId: number | undefined): MenuButton {
      return (
        (chatId === undefined ? undefined : menuButtons.get(String(chatId))) ??
        menuButtons.get("default") ?? { type: "default" }
      );
    },
    setRights(forChannels: boolean, value: AdminRightsSetting | undefined): void {
      if (value === undefined) rights.delete(forChannels);
      else rights.set(forChannels, value);
    },
    rights: (forChannels: boolean): AdminRightsSetting | undefined => rights.get(forChannels),
    setWebhook(next: WebhookState): void {
      webhook = next;
    },
    removeWebhook(): void {
      webhook = NO_WEBHOOK;
    },
    webhook: (): WebhookState => webhook,
    clear(): void {
      commands.clear();
      names.clear();
      descriptions.clear();
      shortDescriptions.clear();
      menuButtons.clear();
      rights.clear();
      webhook = NO_WEBHOOK;
    },
  };
}

export type BotProfile = ReturnType<typeof createBotProfile>;
