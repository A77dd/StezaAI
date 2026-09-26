import { badRequest } from "./rejection";
import type { Payload } from "./guards";

/**
 * Chat kinds by identifier: users have positive ids, groups and supergroups
 * negative ones ("Chat.id may exceed 32 bits", research 4.5), and `@username`
 * targets public supergroups and channels.
 */
export type ChatKind = "private" | "group" | "public";

export type ChatTarget =
  | { readonly kind: "private" | "group"; readonly id: number }
  | { readonly kind: "public"; readonly id: string };

const USERNAME = /^@[A-Za-z][A-Za-z0-9_]{4,31}$/;

export function chatKindOfId(id: number): "private" | "group" {
  return id > 0 ? "private" : "group";
}

/** Reads `chat_id` (`key`): a non-zero integer or an `@username`. */
export function readChatTarget(payload: Payload, key = "chat_id"): ChatTarget {
  const value = payload[key];
  if (value === undefined || value === "") throw badRequest(`${key} is empty`);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value === 0) throw badRequest("chat not found");
    return { kind: chatKindOfId(value), id: value };
  }
  if (typeof value === "string" && USERNAME.test(value)) return { kind: "public", id: value };
  throw badRequest("chat not found");
}

/** A private chat target: drafts and per-chat menu buttons only exist there. */
export function readPrivateChatId(payload: Payload, key = "chat_id"): number {
  const target = readChatTarget(payload, key);
  if (target.kind !== "private") throw badRequest("chat_id must be a private chat");
  return target.id;
}
