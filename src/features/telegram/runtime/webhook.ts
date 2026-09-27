import { timingSafeEqual } from "node:crypto";
import type { Update } from "grammy/types";
import { describeError } from "@/features/telegram/bot";
import type { Logger } from "@/features/telegram/bot";

export type WebhookHandlerDeps = {
  readonly logger: Logger;
  /** The `secret_token` given to `setWebhook`; Telegram echoes it in a header. */
  readonly secret: string;
  readonly handleUpdate: (update: Update) => Promise<void>;
};

/** A host-independent Next.js route body: `Request` in, `Response` out. */
export type WebhookHandler = (request: Request) => Promise<Response>;

const SECRET_HEADER = "x-telegram-bot-api-secret-token";

/**
 * The receiving side of the production webhook (ADR 0002: a thin route —
 * "verify, handle, answer"). Telegram's secret-token header is compared in
 * constant time; anything that is not a well-formed `Update` is rejected
 * before the bot sees it. A failed update answers 500 so Telegram redelivers
 * (the pipeline's deduper drops a duplicate of an update that was actually
 * processed), mirroring what the polling runner's retry loop does.
 *
 * Like the polling runner, a host using this handler keeps adapters in
 * memory: it must run as one long-lived process (ADR 0003).
 */
export function createWebhookHandler(deps: WebhookHandlerDeps): WebhookHandler {
  return async (request) => {
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }

    if (!secretMatches(request.headers.get(SECRET_HEADER), deps.secret)) {
      deps.logger.warn("webhook.rejected", { reason: "secret_mismatch" });
      return new Response("forbidden", { status: 403 });
    }

    let update: Update;
    try {
      const body: unknown = await request.json();
      if (
        typeof body !== "object" ||
        body === null ||
        typeof (body as { update_id?: unknown }).update_id !== "number"
      ) {
        throw new TypeError("not a Telegram Update");
      }
      update = body as Update;
    } catch {
      deps.logger.warn("webhook.rejected", { reason: "invalid_body" });
      return new Response("bad request", { status: 400 });
    }

    try {
      await deps.handleUpdate(update);
      return new Response("OK", { status: 200 });
    } catch (error) {
      deps.logger.error("webhook.update_failed", describeError(error));
      return new Response("internal error", { status: 500 });
    }
  };
}

function secretMatches(header: string | null, secret: string): boolean {
  if (header === null) return false;
  const given = Buffer.from(header, "utf8");
  const expected = Buffer.from(secret, "utf8");
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}
