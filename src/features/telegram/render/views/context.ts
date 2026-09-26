import type { Instant } from "../../domain";
import type { Catalog } from "../catalog";

/**
 * What every view needs besides its own view model: the copy of the user's
 * locale, their timezone, the current time and the bot's identity. Views stay
 * pure because "now" and the timezone come in here instead of being read from
 * a clock or a store.
 */
export type ViewContext = {
  readonly catalog: Catalog;
  /** IANA timezone of the user the message is for. */
  readonly timezone: string;
  readonly now: Instant;
  /** The bot's username, for deep links and `@bot` hints. */
  readonly botUsername: string;
  /** Base address of the Mini App, or null when it is not configured (buttons are then omitted). */
  readonly miniAppUrl: string | null;
};
