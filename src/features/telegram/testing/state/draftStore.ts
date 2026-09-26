export type DraftRecord = {
  readonly chatId: number;
  readonly threadId: number | undefined;
  readonly draftId: number;
  readonly text: string;
  readonly canStop: boolean;
  readonly keepOnStop: boolean;
  readonly updatedAtMs: number;
};

/** "A temporary 30-second preview" (`sendMessageDraft`). */
export const DRAFT_LIFETIME_MS = 30_000;

/**
 * Message drafts shown to a user while the bot works. A draft disappears 30
 * seconds after its last update, when the bot sends a message to the chat, or
 * when the user presses stop (unless `keep_on_stop` was set).
 */
export function createDraftStore() {
  const drafts = new Map<string, DraftRecord>();
  const key = (chatId: number, draftId: number): string => `${chatId}:${draftId}`;

  return {
    put(record: DraftRecord): void {
      drafts.set(key(record.chatId, record.draftId), record);
    },
    /** Drafts still visible at `nowMs`, oldest first. */
    active(nowMs: number, chatId?: number): readonly DraftRecord[] {
      return [...drafts.values()].filter(
        (draft) =>
          nowMs - draft.updatedAtMs < DRAFT_LIFETIME_MS && (chatId === undefined || draft.chatId === chatId),
      );
    },
    find(chatId: number, draftId: number): DraftRecord | undefined {
      return drafts.get(key(chatId, draftId));
    },
    removeChat(chatId: number): void {
      for (const draft of [...drafts.values()]) {
        if (draft.chatId === chatId) drafts.delete(key(draft.chatId, draft.draftId));
      }
    },
    /** The user pressed stop: the draft stays only with `keep_on_stop`. */
    stop(chatId: number, draftId: number): void {
      const draft = drafts.get(key(chatId, draftId));
      if (draft !== undefined && !draft.keepOnStop) drafts.delete(key(chatId, draftId));
    },
    clear(): void {
      drafts.clear();
    },
  };
}

export type DraftStore = ReturnType<typeof createDraftStore>;
