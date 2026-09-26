import type { Update } from "grammy/types";
import { optionalBoolean, optionalInteger, optionalString } from "./guards";
import type { Payload } from "./guards";
import { badRequest } from "./rejection";

export type UpdateType = Exclude<keyof Update, "update_id">;

// A Record over the union fails to compile when the Bot API adds an update.
const UPDATE_TYPE_SET: Readonly<Record<UpdateType, true>> = {
  message: true,
  edited_message: true,
  channel_post: true,
  edited_channel_post: true,
  business_connection: true,
  business_message: true,
  edited_business_message: true,
  deleted_business_messages: true,
  guest_message: true,
  stopped_message_generation: true,
  message_reaction: true,
  message_reaction_count: true,
  inline_query: true,
  chosen_inline_result: true,
  callback_query: true,
  shipping_query: true,
  pre_checkout_query: true,
  purchased_paid_media: true,
  poll: true,
  poll_answer: true,
  my_chat_member: true,
  chat_member: true,
  chat_join_request: true,
  chat_boost: true,
  removed_chat_boost: true,
  managed_bot: true,
  subscription: true,
};

/** Every value `allowed_updates` accepts. */
export const UPDATE_TYPES: readonly string[] = Object.keys(UPDATE_TYPE_SET);

export function isUpdateType(value: unknown): value is UpdateType {
  return typeof value === "string" && Object.hasOwn(UPDATE_TYPE_SET, value);
}

const WEBHOOK_PORTS: readonly string[] = ["", "80", "88", "443", "8443"];
const SECRET_TOKEN = /^[A-Za-z0-9_-]+$/;
const SECRET_TOKEN_MAX = 256;
const MAX_CONNECTIONS_LIMIT = 100;

export type SetWebhookRequest = {
  readonly url: string;
  readonly secretToken: string | undefined;
  readonly allowedUpdates: readonly UpdateType[] | undefined;
  readonly maxConnections: number | undefined;
  readonly dropPendingUpdates: boolean;
};

/**
 * `setWebhook` (research 7.1): an https URL on port 443, 80, 88 or 8443 (an
 * empty URL removes the webhook), `secret_token` of 1-256 characters from
 * `A-Za-z0-9_-`, `max_connections` 1-100, `allowed_updates` from the Update
 * fields.
 *
 * UNVERIFIED: description texts (the "bad webhook" ones and the secret token
 * ones are what the real API is known to answer); unknown `allowed_updates`
 * names are rejected although Telegram may ignore them; reserved and private
 * addresses (`localhost`, `127.0.0.1`) are accepted, the real API rejects them.
 */
export function readSetWebhook(payload: Payload): SetWebhookRequest {
  const url = optionalString(payload, "url");
  if (url === undefined) throw badRequest("bad webhook: HTTPS url must be provided for webhook");
  if (url !== "") {
    if (!URL.canParse(url) || new URL(url).protocol !== "https:") {
      throw badRequest("bad webhook: HTTPS url must be provided for webhook");
    }
    if (!WEBHOOK_PORTS.includes(new URL(url).port)) {
      throw badRequest("bad webhook: Webhook can be set up only on ports 80, 88, 443 or 8443");
    }
  }

  const secretToken = optionalString(payload, "secret_token");
  if (secretToken !== undefined) {
    if (secretToken === "") throw badRequest("secret token is empty");
    if (!SECRET_TOKEN.test(secretToken)) throw badRequest("secret token contains unallowed characters");
    if (secretToken.length > SECRET_TOKEN_MAX) throw badRequest("secret token is too long");
  }

  let allowedUpdates: UpdateType[] | undefined;
  if (payload.allowed_updates !== undefined) {
    if (!Array.isArray(payload.allowed_updates)) throw badRequest("allowed_updates must be an array");
    allowedUpdates = (payload.allowed_updates as unknown[]).map((type) => {
      if (!isUpdateType(type)) throw badRequest("unsupported update type in allowed_updates");
      return type;
    });
  }

  const maxConnections = optionalInteger(payload, "max_connections", 1);
  if (maxConnections !== undefined && maxConnections > MAX_CONNECTIONS_LIMIT) {
    throw badRequest("max_connections must be between 1 and 100");
  }
  return {
    url,
    secretToken,
    allowedUpdates,
    maxConnections,
    dropPendingUpdates: optionalBoolean(payload, "drop_pending_updates") ?? false,
  };
}
