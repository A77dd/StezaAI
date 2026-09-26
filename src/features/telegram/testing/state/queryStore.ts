export type QueryKind = "callback" | "inline" | "guest";

export type QueryRecord = {
  readonly kind: QueryKind;
  readonly id: string;
  readonly chatId: number | undefined;
  readonly fromUserId: number | undefined;
  readonly deliveredAtMs: number;
  readonly answered: boolean;
};

type MutableQuery = { -readonly [K in keyof QueryRecord]: QueryRecord[K] };

/**
 * Queries a user started and the bot has to answer: callback queries, inline
 * queries and guest queries. Each can be answered once; an unknown or
 * already answered id is what the Bot API calls "query is too old".
 */
export function createQueryStore() {
  const queries = new Map<string, MutableQuery>();
  const inlineMessageIds = new Set<string>();
  const key = (kind: QueryKind, id: string): string => `${kind}:${id}`;

  return {
    /** A query delivered twice (a repeated update) keeps its answered state. */
    register(query: Omit<QueryRecord, "answered">): void {
      if (!queries.has(key(query.kind, query.id))) queries.set(key(query.kind, query.id), { ...query, answered: false });
    },
    find(kind: QueryKind, id: string): QueryRecord | undefined {
      return queries.get(key(kind, id));
    },
    /** Marks the query answered; `false` if it is unknown or was answered before. */
    answer(kind: QueryKind, id: string): boolean {
      const query = queries.get(key(kind, id));
      if (query === undefined || query.answered) return false;
      query.answered = true;
      return true;
    },
    ids(kind: QueryKind, answered: boolean): readonly string[] {
      return [...queries.values()]
        .filter((query) => query.kind === kind && query.answered === answered)
        .map((query) => query.id);
    },
    /** Inline messages (from chosen inline results and guest answers) the bot may edit. */
    rememberInlineMessage(inlineMessageId: string): void {
      inlineMessageIds.add(inlineMessageId);
    },
    knowsInlineMessage(inlineMessageId: string): boolean {
      return inlineMessageIds.has(inlineMessageId);
    },
    clear(): void {
      queries.clear();
      inlineMessageIds.clear();
    },
  };
}

export type QueryStore = ReturnType<typeof createQueryStore>;
