import type { Message } from "grammy/types";

export type EphemeralRecord = {
  readonly chatId: number;
  readonly receiverUserId: number;
  readonly ephemeralMessageId: number;
  readonly message: Message;
  readonly deleted: boolean;
  readonly createdAtMs: number;
};

type MutableEphemeral = { -readonly [K in keyof EphemeralRecord]: EphemeralRecord[K] };

/** Ephemeral messages: the ones the bot sent and the ones users sent to it. */
export function createEphemeralStore() {
  const records = new Map<string, MutableEphemeral>();
  const last = new Map<number, number>();
  const key = (chatId: number, receiverUserId: number, id: number): string =>
    `${chatId}:${receiverUserId}:${id}`;

  return {
    nextId(chatId: number): number {
      const id = (last.get(chatId) ?? 0) + 1;
      last.set(chatId, id);
      return id;
    },
    add(record: Omit<EphemeralRecord, "deleted">): EphemeralRecord {
      const entry: MutableEphemeral = { ...record, deleted: false };
      records.set(key(record.chatId, record.receiverUserId, record.ephemeralMessageId), entry);
      return entry;
    },
    get(chatId: number, receiverUserId: number, ephemeralMessageId: number): EphemeralRecord | undefined {
      const record = records.get(key(chatId, receiverUserId, ephemeralMessageId));
      return record === undefined || record.deleted ? undefined : record;
    },
    replaceMessage(record: EphemeralRecord, message: Message): void {
      const entry = records.get(key(record.chatId, record.receiverUserId, record.ephemeralMessageId));
      if (entry !== undefined) entry.message = message;
    },
    markDeleted(record: EphemeralRecord): void {
      const entry = records.get(key(record.chatId, record.receiverUserId, record.ephemeralMessageId));
      if (entry !== undefined) entry.deleted = true;
    },
    list(): readonly EphemeralRecord[] {
      return [...records.values()].filter((record) => !record.deleted);
    },
    clear(): void {
      records.clear();
      last.clear();
    },
  };
}

export type EphemeralStore = ReturnType<typeof createEphemeralStore>;
