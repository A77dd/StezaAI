import { createDefaultSettings } from "../index";
import type { Locale, UserId, UserSettings } from "../index";
import type { PersonalFlowPorts } from "./ports";

export type StartUserInput = {
  readonly userId: UserId;
  readonly locale: Locale;
};

export type StartUserResult = {
  /** `false` when the user already had settings (a returning user, e.g. `/start` again). */
  readonly isNew: boolean;
  readonly settings: UserSettings;
};

/**
 * Ensures a user has settings, creating the explicit defaults
 * (`timezoneConfirmed: false`) on first contact. Idempotent: calling it again
 * for an existing user changes nothing and returns their current settings.
 */
export function createStartUser(ports: Pick<PersonalFlowPorts, "settings">) {
  return async function startUser(input: StartUserInput): Promise<StartUserResult> {
    const existing = await ports.settings.get(input.userId);
    if (existing !== null) {
      return { isNew: false, settings: existing };
    }
    const created = await ports.settings.upsert(createDefaultSettings(input.userId, input.locale));
    return { isNew: true, settings: created };
  };
}
