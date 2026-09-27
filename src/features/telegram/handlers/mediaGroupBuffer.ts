import type { ExtractedForward } from "./forwardExtractor";

export type MediaGroupTimers = {
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimeout(id: ReturnType<typeof setTimeout>): void;
};

export type MediaGroupBuffer = {
  add(input: { chatId: number; mediaGroupId: string; message: ExtractedForward }): Promise<void>;
  drain(): Promise<void>;
  close(): Promise<void>;
};

export function createMediaGroupBuffer(input: {
  timers: MediaGroupTimers;
  onFlush(item: ExtractedForward, group: { chatId: number; mediaGroupId: string }): Promise<void>;
  onError(error: unknown): void;
}): MediaGroupBuffer {
  type Group = {
    readonly chatId: number;
    readonly mediaGroupId: string;
    readonly messages: Map<number, ExtractedForward>;
    inactivity: ReturnType<typeof setTimeout> | null;
    hard: ReturnType<typeof setTimeout>;
  };
  const groups = new Map<string, Group>();
  const pending = new Set<Promise<void>>();
  let closed = false;

  const keyOf = (chatId: number, mediaGroupId: string) => JSON.stringify([chatId, mediaGroupId]);

  function flush(key: string): Promise<void> {
    const group = groups.get(key);
    if (group === undefined) return Promise.resolve();
    groups.delete(key);
    if (group.inactivity !== null) input.timers.clearTimeout(group.inactivity);
    input.timers.clearTimeout(group.hard);
    const sorted = [...group.messages.entries()].sort(([a], [b]) => a - b);
    const first = sorted[0]?.[1];
    if (first === undefined) return Promise.resolve();
    const text = sorted.map(([, message]) => message.text.trim()).filter(Boolean).join("\n");
    if (text === "") return Promise.resolve();
    const item: ExtractedForward = {
      text,
      dateTimeHints: sorted.flatMap(([, message]) => message.dateTimeHints),
      source: {
        ...first.source,
        sourceMessageId: sorted[0]![0],
        relatedMessageIds: sorted.slice(1).map(([id]) => id),
        sourceText: text,
      },
    };
    const work = input.onFlush(item, { chatId: group.chatId, mediaGroupId: group.mediaGroupId });
    pending.add(work);
    void work.then(() => pending.delete(work), () => pending.delete(work));
    return work;
  }

  function schedule(key: string, group: Group): void {
    if (group.inactivity !== null) input.timers.clearTimeout(group.inactivity);
    group.inactivity = input.timers.setTimeout(() => {
      void flush(key).catch(input.onError);
    }, 1000);
  }

  async function drain(): Promise<void> {
    await Promise.all([...groups.keys()].map(flush));
    await Promise.all(pending);
  }

  return {
    async add({ chatId, mediaGroupId, message }) {
      if (closed) throw new Error("Media group buffer is closed");
      const id = message.source.sourceMessageId;
      if (id === null) throw new Error("Album message requires a Telegram message id");
      const key = keyOf(chatId, mediaGroupId);
      let group = groups.get(key);
      if (group === undefined) {
        group = {
          chatId,
          mediaGroupId,
          messages: new Map(),
          inactivity: null,
          hard: input.timers.setTimeout(() => {
            void flush(key).catch(input.onError);
          }, 5000),
        };
        groups.set(key, group);
      }
      group.messages.set(id, message);
      if (group.messages.size >= 10) {
        await flush(key);
      } else {
        schedule(key, group);
      }
    },
    drain,
    async close() {
      closed = true;
      await drain();
    },
  };
}
