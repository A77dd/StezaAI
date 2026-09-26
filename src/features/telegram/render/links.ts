import { RenderError } from "./errors";

/**
 * Links the bot puts into messages. Both validate what they build and never
 * echo the rejected value (it may be user or config data).
 */

// Telegram bot usernames: 5-32 characters of letters, digits and underscores,
// starting with a letter and ending in "bot" (any case).
const BOT_USERNAME = /^[A-Za-z][A-Za-z0-9_]{1,28}bot$/i;
// Bot API deep linking: up to 64 characters of A-Z a-z 0-9 _ -.
const START_PAYLOAD = /^[A-Za-z0-9_-]{1,64}$/;
const PATH_SEGMENT = /^[A-Za-z0-9_-]+$/;

/** `https://t.me/<bot>?start=<payload>`: opens the private chat and sends `/start <payload>`. */
export function botStartLink(botUsername: string, payload: string): string {
  if (!BOT_USERNAME.test(botUsername)) {
    throw new RenderError("Bot username must be 5-32 letters, digits or underscores ending in bot");
  }
  if (!START_PAYLOAD.test(payload)) {
    throw new RenderError("Start payload must be 1-64 characters of A-Z a-z 0-9 _ -");
  }
  return `https://t.me/${botUsername}?start=${payload}`;
}

/**
 * Address of a Mini App page: the configured https base plus optional path
 * segments (`settings`, `tasks/t_1`). Segments are restricted to
 * `[A-Za-z0-9_-]` so a value cannot climb out of the base or add a query.
 */
export function miniAppLink(base: string, path?: string): string {
  if (!URL.canParse(base)) throw new RenderError("Mini App base must be an absolute URL");
  const url = new URL(base);
  if (url.protocol !== "https:") throw new RenderError("Mini App base must use https");
  if (url.search !== "" || url.hash !== "") {
    throw new RenderError("Mini App base must not carry a query or a fragment");
  }
  if (path === undefined) return url.href;
  const segments = path.split("/");
  if (!segments.every((segment) => PATH_SEGMENT.test(segment))) {
    throw new RenderError("Mini App path must be segments of A-Z a-z 0-9 _ - separated by /");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${segments.join("/")}`;
  return url.href;
}
